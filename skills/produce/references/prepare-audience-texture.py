#!/usr/bin/env python3
"""Stretch a phrase from an episode's completed music job into a short audience cue."""
import argparse
import array
import contextlib
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import random
import re
import subprocess
import sys
import tempfile

RATE = 48000
METHOD = 'granular-time-stretch'
SEED = 1943
RECIPE_FIELDS = ('sourceStartSeconds', 'sourceDurationSeconds', 'grainSeconds',
                 'grainHopSamples', 'grainRateRatios', 'seed', 'filter', 'durationSeconds')


def digest(file):
    with file.open('rb') as source:
        h = hashlib.sha256()
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value, low, high, name):
    require(type(value) in (int, float) and math.isfinite(value) and low <= value <= high,
            f'{name} must be between {low} and {high}')
    return value


def safe_child(episode, file):
    result = file.resolve()
    require(result.is_relative_to(episode), f'Path leaves the episode: {file.name}')
    return result


def decimal(value):
    return format(value, '.9f').rstrip('0').rstrip('.')


def filters(low, high, duration):
    number(low, 1, RATE / 2 - 1, 'highpass')
    number(high, low, RATE / 2 - 1, 'lowpass')
    require(low < high, 'highpass must be below lowpass')
    return (f'highpass=f={decimal(low)},lowpass=f={decimal(high)},afade=t=in:d=0.12,'
            f'afade=t=out:st={decimal(duration - .35)}:d=0.35')


def recipe(start, span, grain, ratios, duration, low, high):
    number(start, 0, 24 * 60 * 60, 'source start')
    number(span, .05, 30, 'source duration')
    number(duration, .5, 30, 'output duration')
    number(grain, .01, 1, 'grain duration')
    require(isinstance(ratios, list) and 1 <= len(ratios) <= 32, 'Provide 1 to 32 grain ratios')
    for ratio in ratios:
        number(ratio, .125, 4, 'grain ratio')
    size = round(RATE * grain)
    require(round(RATE * span) > math.ceil(size * max(ratios)) + 2,
            'Source selection must contain the longest grain')
    return dict(zip(RECIPE_FIELDS, (start, span, grain, size // 5, ratios, SEED,
                                    filters(low, high, duration), duration)))


def completed(episode, job):
    state_file = safe_child(episode, episode / '.work/music-routing/state.json')
    state = json.loads(state_file.read_text())
    rec = state['jobs'].get(job)
    require(rec and rec.get('status') == 'completed' and rec.get('requestId') == job,
            'A completed episode music request ID is required')
    require(isinstance(rec.get('providerId'), str) and rec['providerId'], 'Missing music provider receipt')
    output = rec['output']
    source = safe_child(episode, Path(output['audioPath']))
    require(source == safe_child(episode, Path(rec['outputFile'])), 'Music job paths disagree')
    require(source.is_file() and source.suffix.lower() == '.wav' and digest(source) == output['sha256'],
            'Generated WAV is missing or its receipt hash differs')
    return rec, source


def pcm_floats(data):
    values = array.array('f')
    values.frombytes(data)
    if sys.byteorder != 'little':
        values.byteswap()
    return values


def render(source, spec, dest):
    raw = subprocess.check_output([
        'ffmpeg', '-nostdin', '-v', 'error', '-ss', str(spec['sourceStartSeconds']),
        '-t', str(spec['sourceDurationSeconds']), '-i', str(source), '-map', '0:a:0',
        '-ar', str(RATE), '-ac', '1', '-f', 'f32le', '-'])
    pcm = pcm_floats(raw)
    require(abs(len(pcm) - round(RATE * spec['sourceDurationSeconds'])) <= 2,
            'Source selection goes beyond the generated WAV')
    count = round(RATE * spec['durationSeconds'])
    size = round(RATE * spec['grainSeconds'])
    hop = spec['grainHopSamples']
    window = [.5 - .5 * math.cos(2 * math.pi * k / (size - 1)) for k in range(size)]
    sums = [0.] * count
    weights = [0.] * count
    rng = random.Random(spec['seed'])
    ratios = spec['grainRateRatios']
    for index, start in enumerate(range(-size + hop, count, hop)):
        ratio = ratios[index % len(ratios)]
        allowed = len(pcm) - math.ceil(size * ratio) - 2
        require(allowed > 0, 'Source selection is too short')
        progress = min(1, max(0, (start + size * .5) / count))
        anchor = round(allowed * (.18 + .59 * progress) + rng.uniform(-.09, .09) * allowed)
        anchor = max(0, min(allowed, anchor))
        for k in range(max(0, -start), min(size, count - start)):
            x = anchor + k * ratio
            i = int(x)
            fraction = x - i
            sums[start + k] += (pcm[i] * (1 - fraction) + pcm[i + 1] * fraction) * window[k]
            weights[start + k] += window[k]
    samples = array.array('f', (s / max(w, .01) for s, w in zip(sums, weights)))
    peak = max(map(abs, samples))
    require(peak > 1e-5 and math.isfinite(peak), 'Selected phrase is silent or invalid')
    normalized = array.array('f', (v / peak * .6 for v in samples))
    if sys.byteorder != 'little':
        normalized.byteswap()
    subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-f', 'f32le', '-ar', str(RATE),
                    '-ac', '1', '-i', '-', '-af', spec['filter'], '-ac', '2', '-c:a', 'pcm_s24le',
                    str(dest)], input=normalized.tobytes(), check=True)


def proof(key, job, rec, source, spec, file):
    serialized = json.dumps(spec, separators=(',', ':'), allow_nan=False)
    return {'recipeVersion': 1, 'method': METHOD, 'assetId': key, 'file': key + '.wav',
            'sha256': digest(file), 'source': str(source), 'sourceSha256': rec['output']['sha256'],
            'providerRequestId': rec['providerId'], 'musicRequestId': job, **spec,
            'recipeJson': serialized, 'recipeSha256': hashlib.sha256(serialized.encode()).hexdigest(),
            'scriptSha256': digest(Path(__file__)), 'review': 'not_reviewed'}


def receipt_inputs(receipt):
    require(receipt['method'] == METHOD and type(receipt['recipeVersion']) is int and
            receipt['recipeVersion'] == 1, 'Unsupported texture recipe')
    matched = re.fullmatch(r'highpass=f=(\d+(?:\.\d+)?),lowpass=f=(\d+(?:\.\d+)?),afade=t=in:d=0\.12,'
                           r'afade=t=out:st=\d+(?:\.\d+)?:d=0\.35', receipt['filter'])
    require(matched, 'Unsupported filter recipe')
    spec = recipe(receipt['sourceStartSeconds'], receipt['sourceDurationSeconds'], receipt['grainSeconds'],
                  receipt['grainRateRatios'], receipt['durationSeconds'], *(float(n) for n in matched.groups()))
    return receipt['assetId'], receipt['musicRequestId'], spec


def prepare(args):
    episode = Path(args.episode).resolve(strict=True)
    folder = safe_child(episode, episode / '.work/music/audience')
    receipt = None
    if args.verify_receipt:
        require(not any(v is not None for v in (args.job,args.target,args.source_start,args.source_duration,
                args.grain,args.ratios,args.duration,args.highpass,args.lowpass)), 'Verification takes only the receipt')
        file = Path(args.verify_receipt)
        require(not file.is_symlink() and file.resolve().parent == folder, 'Receipt must be inside episode audience folder')
        receipt = json.loads(file.read_text())
        key, job, spec = receipt_inputs(receipt)
    else:
        key, job = args.target, args.job
        require(all(v is not None for v in (key,job,args.source_start,args.source_duration,args.grain,
                args.ratios,args.highpass,args.lowpass)), 'Target, job and all source, grain and filter settings are required')
        spec = recipe(args.source_start, args.source_duration, args.grain, [float(v) for v in args.ratios.split(',')],
                      args.duration if args.duration is not None else 4.5, args.highpass, args.lowpass)
    require(isinstance(key, str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{0,110}', key), 'Invalid audience texture key')
    rec, source = completed(episode, job)
    wav, meta = folder / (key + '.wav'), folder / (key + '.source.json')
    require(not wav.is_symlink() and not meta.is_symlink() and wav != source, 'Unsafe texture destination')
    if receipt is not None:
        require(file.resolve() == meta and wav.is_file(), 'Receipt and output filenames do not match the target')
    else:
        folder.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=None if receipt is not None else folder) as temp:
        tmp = Path(temp) / wav.name
        render(source, spec, tmp)
        require(digest(source) == rec['output']['sha256'], 'Source changed during rendering')
        expected = proof(key, job, rec, source, spec, tmp)
        if receipt is not None:
            require(receipt == expected and digest(wav) == expected['sha256'], 'Texture replay or receipt does not match')
            return f'verified {wav.name} {expected["sha256"]}'
        temp_meta = Path(temp) / meta.name
        temp_meta.write_text(json.dumps(expected, indent=2, ensure_ascii=False) + '\n')
        # Link each complete file without replacing an existing one. Retrying also repairs a
        # missing sidecar after interruption. Lock this directory until both checks and links finish.
        with contextlib.ExitStack() as guard:
            lock = os.open(folder, os.O_RDONLY)
            guard.callback(os.close, lock)
            fcntl.flock(lock, fcntl.LOCK_EX)
            require(not wav.is_symlink() and not meta.is_symlink(), 'Unsafe texture destination')
            require(not wav.exists() or digest(wav) == expected['sha256'], 'Refusing to replace a different WAV')
            require(not meta.exists() or json.loads(meta.read_text()) == expected, 'Refusing to replace a different receipt')
            if not wav.exists():
                os.link(tmp, wav)
            if not meta.exists():
                os.link(temp_meta, meta)
    return f'{wav.name} {expected["sha256"]}'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('episode', help='Episode directory containing the completed music request')
    parser.add_argument('--verify-receipt', metavar='FILE', help='Replay an existing receipt in temporary storage')
    parser.add_argument('--job', help='Completed music request ID in this episode')
    parser.add_argument('--target', help='New audience cue key')
    parser.add_argument('--source-start', type=float)
    parser.add_argument('--source-duration', type=float)
    parser.add_argument('--grain', type=float, help='Grain duration in seconds')
    parser.add_argument('--ratios', help='Comma-separated grain playback rates')
    parser.add_argument('--highpass', type=float, help='High-pass frequency in Hz')
    parser.add_argument('--lowpass', type=float, help='Low-pass frequency in Hz')
    parser.add_argument('--duration', type=float, help='Output seconds (default 4.5)')
    try:
        print(prepare(parser.parse_args()))
    except (KeyError, TypeError, ValueError, OSError, subprocess.CalledProcessError) as error:
        sys.exit(f'prepare-audience-texture: {error}')
