"""Run resumable local upscale jobs independently of the MCP connection."""
import argparse
import contextlib
import hashlib
import importlib.util
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

WEIGHTS = {
    'realesr-general-x4v3.pth': '8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292',
    'realesr-general-wdn-x4v3.pth': '1641f8c4464b9f097c9fdda5589273713f67cf59f3d909e0bd688f0cee269dca',
}


def digest(file):
    with open(file, 'rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def atomic(file, value):
    temp = file.with_suffix('.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.replace(file)


def command(args):
    return subprocess.check_output(args, text=True, timeout=120)


def probe(file):
    return json.loads(command(['ffprobe', '-v', 'error', '-count_frames',
                              '-show_streams', '-of', 'json', str(file)]))


def source_info(file):
    data = probe(file)
    video = next((s for s in data['streams'] if s['codec_type'] == 'video'), None)
    if not video:
        raise ValueError(f'No video stream: {file}')
    n, d = map(int, video['r_frame_rate'].split('/'))
    fps = n / d if d else 0
    frames = int(video['nb_read_frames'])
    if not 0 < fps <= 120 or frames < 1:
        raise ValueError('Unsupported frame rate or empty video')
    if video.get('color_transfer') in ('smpte2084', 'arib-std-b67'):
        raise ValueError('HDR needs an explicit colour conversion before upscale')
    if any(float(s.get('rotation', 0)) != 0 for s in video.get('side_data_list', [])):
        raise ValueError('Bake display rotation into the source before upscale')
    # Checking actual timestamps catches VFR files whose average resembles CFR.
    points = json.loads(command(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                 '-show_frames', '-show_entries',
                                 'frame=best_effort_timestamp_time', '-of', 'json', str(file)]))['frames']
    times = [float(p['best_effort_timestamp_time']) for p in points]
    if len(times) != frames or abs(times[0]) > .001 or any(
            abs(t - i / fps) > .001 for i, t in enumerate(times)):
        raise ValueError('Only zero-start constant-frame-rate video is supported')
    if video.get('sample_aspect_ratio', '1:1') not in ('1:1', '0:1', 'N/A'):
        raise ValueError('Only square-pixel sources are supported')
    for audio in (s for s in data['streams'] if s['codec_type'] == 'audio'):
        if abs(float(audio.get('start_time', 0))) > .001:
            raise ValueError('Audio with a nonzero start offset needs an explicit remux first')
    return {'path': str(file), 'sha256': digest(file), 'width': video['width'],
            'height': video['height'], 'fps': video['r_frame_rate'], 'frames': frames,
            'duration': frames / fps,
            'audioStreams': sum(s['codec_type'] == 'audio' for s in data['streams'])}


def fit_filter(source, request):
    width = request.get('width', source['width'] * 2)
    height = request.get('height', source['height'] * 2)
    if width % 2 or height % 2 or max(width, height) > 7680:
        raise ValueError('Output must have even sides up to 7680 pixels')
    mode = request['fit']
    aspect = 'increase' if mode == 'cover' else 'decrease'
    tail = f'crop={width}:{height}' if mode == 'cover' else f'pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black'
    # scale's force_divisible_by makes padding/cropping chroma-safe.
    return (f'scale={width}:{height}:force_original_aspect_ratio={aspect}:'
            f'force_divisible_by=2:flags=lanczos,{tail},setsar=1'), width, height


class Cancelled(Exception):
    """Signal an explicitly requested cooperative cancellation."""


class UpscaleAdapter:
    """Transform picture only; the runner owns verification and receipts."""
    id = ''
    description = ''
    dependencies = ()

    def __init__(self, request):
        self.request = request

    def run(self, source, target, progress, check_cancel):
        raise NotImplementedError

    def encoder(self, inputs, source, target, filters):
        return ['ffmpeg', '-v', 'error', '-y', *inputs, '-map', '0:v:0',
                '-map', '1:a?', '-vf', filters, '-c:v', 'libx264', '-preset', 'fast',
                '-crf', '17', '-threads', '4', '-pix_fmt', 'yuv420p', '-c:a', 'copy',
                '-fps_mode', 'passthrough', '-movflags', '+faststart', str(target)]


class LanczosAdapter(UpscaleAdapter):
    id = 'lanczos'
    description = 'Conventional Lanczos resize; no AI restoration or model weights.'

    def run(self, source, target, progress, check_cancel):
        filters, _, _ = fit_filter(source, self.request)
        args = self.encoder(['-noautorotate', '-i', source['path'], '-i', source['path']], source, target, filters)
        with open(target.with_suffix('.log'), 'w') as log:
            proc = subprocess.Popen(args, stderr=log)
            try:
                while proc.poll() is None:
                    check_cancel()
                    progress(0)
                    time.sleep(.2)
                if proc.returncode:
                    raise RuntimeError(f'FFmpeg failed; see {target.with_suffix(".log")}')
            finally:
                stop(proc)
        progress(source['frames'])


class RealEsrganAdapter(UpscaleAdapter):
    id = 'realesrgan'
    description = 'Real-ESRGAN general x4v3, native-frame 4x inference then output fit.'
    dependencies = ('torch', 'numpy', 'PIL', 'spandrel')

    def __init__(self, request):
        super().__init__(request)
        import torch
        from spandrel import ModelLoader
        self.torch = torch
        torch.set_num_threads(4)
        device = request['device']
        if device == 'auto':
            device = 'mps' if torch.backends.mps.is_available() else 'cuda' if torch.cuda.is_available() else 'cpu'
        if device == 'mps' and not torch.backends.mps.is_available():
            raise ValueError('MPS is unavailable')
        if device == 'cuda' and not torch.cuda.is_available():
            raise ValueError('CUDA is unavailable')
        self.device = device
        self.dtype = torch.float32 if device == 'cpu' else torch.float16
        weights = []
        for name in WEIGHTS:
            data = torch.load(Path(request['modelsDirectory']) / name,
                              map_location='cpu', weights_only=True)
            weights.append(data.get('params_ema', data.get('params', data)))
        strength = request['denoiseStrength']
        combined = {k: weights[0][k] * strength + weights[1][k] * (1 - strength)
                    for k in weights[0]}
        self.model = ModelLoader().load_from_state_dict(combined).to(device=device, dtype=self.dtype).eval()

    def run(self, source, target, progress, check_cancel):
        import numpy as np
        from PIL import Image, ImageOps
        torch = self.torch
        width, height = source['width'], source['height']
        _, out_w, out_h = fit_filter(source, self.request)
        decode = ['ffmpeg', '-v', 'error', '-noautorotate', '-i', source['path'],
                  '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
        inputs = ['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{out_w}x{out_h}',
                  '-r', source['fps'], '-i', '-', '-i', source['path']]
        encode = self.encoder(inputs, source, target, 'setsar=1')
        with open(target.with_suffix('.log'), 'w') as log:
            dec = subprocess.Popen(decode, stdout=subprocess.PIPE, stderr=log)
            enc = subprocess.Popen(encode, stdin=subprocess.PIPE, stderr=log)
            count = 0
            try:
                with torch.inference_mode():
                    while True:
                        check_cancel()
                        raw = dec.stdout.read(width * height * 3)
                        if not raw:
                            break
                        if len(raw) != width * height * 3:
                            raise ValueError('Incomplete decoded frame')
                        pixels = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3).copy()
                        tensor = torch.from_numpy(pixels).permute(2, 0, 1).unsqueeze(0).to(device=self.device, dtype=self.dtype) / 255
                        result = self.model(tensor)
                        pixels = (result[0].clamp(0, 1).float().cpu().permute(1, 2, 0).numpy() * 255).round().astype('uint8')
                        image = Image.fromarray(pixels)
                        if self.request['fit'] == 'cover':
                            image = ImageOps.fit(image, (out_w, out_h), method=Image.Resampling.LANCZOS)
                        else:
                            image = ImageOps.pad(image, (out_w, out_h), method=Image.Resampling.LANCZOS, color='black')
                        enc.stdin.write(image.tobytes())
                        count += 1
                        progress(count)
                enc.stdin.close()
                if enc.wait() or dec.wait() or count != source['frames']:
                    raise RuntimeError('Frame decode/encode failed')
            finally:
                stop(enc)
                stop(dec)
                dec.stdout.close()


ADAPTERS = {a.id: a for a in (RealEsrganAdapter, LanczosAdapter)}


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def catalog(models):
    return {'adapters': [{'id': a.id, 'description': a.description,
                         'available': sys.version_info >= (3, 11) and os.name == 'posix' and bool(shutil.which('ffmpeg')) and bool(shutil.which('ffprobe')) and all(importlib.util.find_spec(d) is not None for d in a.dependencies) and (a.id != 'realesrgan' or all((Path(models) / n).is_file() for n in WEIGHTS)),
                         'dependencies': list(a.dependencies), 'audio': 'packet-copy',
                         'preservesFrames': True, 'interpolation': False,
                         'review': 'not_reviewed', 'billing': 'local-no-api-calls'}
                        for a in ADAPTERS.values()],
            'python': sys.executable, 'pythonVersion': sys.version.split()[0], 'ffmpeg': shutil.which('ffmpeg'),
            'ffprobe': shutil.which('ffprobe'), 'modelsDirectory': str(models),
            'weights': WEIGHTS, 'legacyGenerativeTool': 'astra_video_upscale'}


def prepare(request):
    if request['adapter'] not in ADAPTERS:
        raise ValueError('Unsupported upscale adapter')
    cap = catalog(request['modelsDirectory'])
    if not next(a for a in cap['adapters'] if a['id'] == request['adapter'])['available']:
        raise ValueError('Upscale dependencies unavailable; call video_upscale_catalog and follow local setup')
    weights = {}
    if request['adapter'] == 'realesrgan':
        for name, expected in WEIGHTS.items():
            actual = digest(Path(request['modelsDirectory']) / name)
            if actual != expected:
                raise ValueError(f'Unexpected model checksum: {name}')
            weights[name] = actual
    clips = [source_info(Path(file)) for file in request['sources']]
    for clip in clips:
        fit_filter(clip, request)
    keys = ('adapter', 'sources', 'outputDirectory', 'width', 'height', 'fit',
            'denoiseStrength', 'device', 'pythonPath', 'modelsDirectory')
    prepared = {key: request[key] for key in keys if key in request}
    versions = {'python': sys.version.split()[0]}
    if request['adapter'] == 'realesrgan':
        versions.update({name: importlib.metadata.version(name)
                         for name in ('torch', 'numpy', 'Pillow', 'spandrel')})
    prepared.update(clips=clips, weights=weights, runtimeVersions=versions,
                    implementationSha256=digest(__file__))
    serialized = json.dumps(prepared, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    prepared['settingsFingerprint'] = hashlib.sha256(serialized.encode()).hexdigest()
    return prepared


def audio_hash(file):
    # Hash every audio stream's encoded packets without decoding/re-encoding.
    return command(['ffmpeg', '-v', 'error', '-i', str(file), '-map', '0:a',
                    '-c', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-']).strip()


def verify(source, target, request):
    output = source_info(target)
    _, width, height = fit_filter(source, request)
    if (output['width'], output['height']) != (width, height):
        raise ValueError('Output dimensions differ from the request')
    if output['frames'] != source['frames'] or output['fps'] != source['fps']:
        raise ValueError('Output frame count or rate changed')
    if output['audioStreams'] != source['audioStreams']:
        raise ValueError('Output audio stream count changed')
    if source['audioStreams'] and audio_hash(target) != audio_hash(source['path']):
        raise ValueError('Output audio packets changed')
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(target), '-f', 'null', '-'], check=True)
    return output


def run_job(directory):
    import fcntl
    directory = Path(directory).resolve()
    request = json.loads((directory / 'request.json').read_text())
    if request.get('version') != 1 or request['jobDirectory'] != str(directory):
        raise ValueError('Invalid job directory')
    started = time.monotonic()
    state = {'status': 'running', 'completedClips': 0, 'totalClips': len(request['clips']),
             'review': 'not_reviewed', 'results': [], 'adapter': request['adapter']}

    def update(**kwargs):
        state.update(kwargs)
        state['elapsedSeconds'] = round(time.monotonic() - started, 2)
        state['updatedAt'] = time.time()
        atomic(directory / 'status.json', state)

    def check_cancel():
        if (directory / 'cancel').exists():
            raise Cancelled('Cancelled by user')

    with open(directory / 'worker.lock', 'w') as lock, contextlib.ExitStack() as resources:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            check_cancel()
            # Refuse changed inputs or weights even on resume.
            checked = prepare(request)
            if checked['settingsFingerprint'] != request['settingsFingerprint']:
                raise ValueError('Source or model changed, or settings changed (including worker/runtime); create a new request')
            adapter = None
            for index, source in enumerate(request['clips']):
                check_cancel()
                target = directory / f'{index + 1:04d}-{Path(source["path"]).stem}.mp4'
                receipt = target.with_suffix('.json')
                partial = target.with_suffix('.partial.mp4')
                update(currentClip=index + 1, currentSource=source['path'], currentFrame=0, clipFrames=source['frames'])
                if target.exists() and receipt.exists():
                    saved = json.loads(receipt.read_text())
                    if saved['fingerprint'] != request['fingerprint'] or saved['output']['sha256'] != digest(target):
                        raise ValueError('Completed output changed; preserve it and create a new job')
                    state['results'].append(saved)
                    update(completedClips=index + 1)
                    continue
                if target.exists():
                    raise ValueError('Unverified output exists; preserve it and create a new job')
                if shutil.disk_usage(directory).free < 1024 ** 3:
                    raise ValueError('Less than 1 GiB free on output volume')
                if adapter is None:
                    if request['adapter'] == 'realesrgan':
                        device_lock = Path.home() / '.cache/social-flow/upscale-device.lock'
                        device_lock.parent.mkdir(parents=True, exist_ok=True)
                        handle = resources.enter_context(open(device_lock, 'a'))
                        try:
                            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        except BlockingIOError as error:
                            raise RuntimeError('Another local AI upscale is running; resume after it finishes') from error
                    adapter = ADAPTERS[request['adapter']](request)
                adapter.run(source, partial, lambda frame: update(currentFrame=frame), check_cancel)
                check_cancel()
                result = verify(source, partial, request)
                if digest(source['path']) != source['sha256']:
                    raise ValueError('Source changed during processing')
                partial.replace(target)
                result['path'] = str(target)
                saved = {'fingerprint': request['fingerprint'], 'adapter': request['adapter'],
                         'source': source, 'output': result, 'weights': request['weights'],
                         'runtimeVersions': request['runtimeVersions'],
                         'implementationSha256': request['implementationSha256'],
                         'fit': request['fit'], 'denoiseStrength': request['denoiseStrength'],
                         'frameInterpolation': False, 'faceEnhancement': False,
                         'audioPacketsIdentical': bool(source['audioStreams']),
                         'audio': 'source-packets-copied' if source['audioStreams'] else 'none',
                         'review': 'not_reviewed', 'device': getattr(adapter, 'device', None)}
                atomic(receipt, saved)
                state['results'].append(saved)
                update(completedClips=index + 1)
            update(status='completed')
        except Cancelled as error:
            update(status='cancelled', error=str(error))
        except Exception as error:
            update(status='failed', error=str(error))
            raise


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--catalog')
    group.add_argument('--prepare', action='store_true')
    group.add_argument('--job')
    args = parser.parse_args()
    if args.catalog:
        print(json.dumps(catalog(args.catalog)))
    elif args.prepare:
        print(json.dumps(prepare(json.load(sys.stdin))))
    else:
        run_job(args.job)


if __name__ == '__main__':
    main()
