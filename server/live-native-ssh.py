#!/usr/bin/env python3
"""Run the speaking-frame renderer over an operator-configured SSH connection."""
import argparse
import io
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tarfile
import tempfile

# Only the four named files are accepted by the remote process. The prompt
# travels in the upload, never in a shell command.
REMOTE = """
import io, os, select, shutil, subprocess, sys, tarfile, tempfile
from pathlib import Path
os.umask(0o077)
with tempfile.TemporaryDirectory(prefix='live-portrait-') as tmp:
    root = Path(tmp)
    names = {'renderer.py', 'voice.wav', 'portrait.png', 'prompt'}
    size = int.from_bytes(sys.stdin.buffer.read(8), 'big')
    if not 0 < size <= 100 * 1024 * 1024:
        raise ValueError('Invalid render payload length')
    with tarfile.open(fileobj=io.BytesIO(sys.stdin.buffer.read(size)), mode='r:gz') as archive:
        for entry in archive:
            if entry.name not in names or not entry.isfile() or entry.size > 32 * 1024 ** 2:
                raise ValueError('Unexpected native render input')
            names.remove(entry.name)
            with (root / entry.name).open('wb') as target:
                shutil.copyfileobj(archive.extractfile(entry), target)
    if names:
        raise ValueError('Incomplete native render inputs')
    result = root / 'render.mp4'
    with subprocess.Popen([sys.executable, str(root/'renderer.py'), '--audio', str(root/'voice.wav'),
                           '--image', str(root/'portrait.png'), '--output', str(result),
                           '--prompt', (root/'prompt').read_text()], stdin=subprocess.DEVNULL, stdout=sys.stderr) as render:
        try:
            while render.poll() is None:
                if select.select([sys.stdin.buffer], [], [], 0.2)[0]:
                    raise RuntimeError('Caller cancelled the render')
            if render.returncode:
                raise RuntimeError('Native renderer failed')
        finally:
            if render.poll() is None:
                render.terminate()
                try:
                    render.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    render.kill()
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
        size = payload.tell()
        payload.seek(0)
        with args.output.open('xb') as result, subprocess.Popen(
            ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '--', host,
             shlex.join([python, '-c', REMOTE])], stdin=subprocess.PIPE, stdout=result) as transport:
            try:
                transport.stdin.write(size.to_bytes(8, 'big'))
                shutil.copyfileobj(payload, transport.stdin)
                transport.stdin.flush()
                # Keep stdin open. Its EOF cancels only this remote GPU render.
                if transport.wait(timeout=1800):
                    raise RuntimeError('Remote native render failed')
            finally:
                transport.stdin.close()



if __name__ == '__main__':
    main()
