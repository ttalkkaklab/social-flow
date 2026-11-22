#!/usr/bin/env python3
"""Run the speaking-frame renderer over an operator-configured SSH connection."""
import argparse
import io
import os
from pathlib import Path
import shlex
import subprocess
import tarfile
import tempfile

# Only the four named files are accepted by the remote process. The prompt
# travels in the upload, never in a shell command.
REMOTE = """
import os, shutil, subprocess, sys, tarfile, tempfile
from pathlib import Path
os.umask(0o077)
with tempfile.TemporaryDirectory(prefix='live-portrait-') as tmp:
    root = Path(tmp)
    names = {'renderer.py', 'voice.wav', 'portrait.png', 'prompt'}
    with tarfile.open(fileobj=sys.stdin.buffer, mode='r|gz') as archive:
        for entry in archive:
            if entry.name not in names or not entry.isfile() or entry.size > 32 * 1024 ** 2:
                raise ValueError('Unexpected native render input')
            names.remove(entry.name)
            with (root / entry.name).open('wb') as target:
                shutil.copyfileobj(archive.extractfile(entry), target)
    if names:
        raise ValueError('Incomplete native render inputs')
    result = root / 'render.mp4'
    subprocess.run([sys.executable, str(root/'renderer.py'), '--audio', str(root/'voice.wav'),
                    '--image', str(root/'portrait.png'), '--output', str(result),
                    '--prompt', (root/'prompt').read_text()], stdout=sys.stderr, check=True)
    with result.open('rb') as media:
        shutil.copyfileobj(media, sys.stdout.buffer)
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('worker', type=Path)
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--audio', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--prompt', required=True)
    args = parser.parse_args()
    host = os.environ['SOCIAL_FLOW_LIVE_GPU_HOST']
    python = os.environ['SOCIAL_FLOW_LIVE_GPU_PYTHON']
    if not host or host.startswith('-') or not python.startswith('/'):
        raise ValueError('Configure the production SSH host and absolute LTX Python path')
    with tempfile.TemporaryFile() as payload:
        with tarfile.open(fileobj=payload, mode='w:gz') as archive:
            for file, name in [(args.worker, 'renderer.py'), (args.image, 'portrait.png'), (args.audio, 'voice.wav')]:
                data = Path(file).resolve()
                if not data.is_file() or data.stat().st_size > 32 * 1024 ** 2:
                    raise ValueError('Invalid native render input')
                archive.add(data, arcname=name, recursive=False)
            text = args.prompt.encode()
            member = tarfile.TarInfo('prompt')
            member.size = len(text)
            archive.addfile(member, io.BytesIO(text))
        payload.seek(0)
        with args.output.open('xb') as result:
            subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                            '--', host, shlex.join([python, '-c', REMOTE])],
                           stdin=payload, stdout=result, check=True, timeout=1800)


if __name__ == '__main__':
    main()
