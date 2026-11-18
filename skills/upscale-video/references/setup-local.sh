#!/usr/bin/env bash
# Explicit local setup; the MCP tools never invoke this script or download weights.
set -euo pipefail
UPSCALER_HOME="${1:-$HOME/.local/share/social-flow/upscale-tools}"
UPSCALER_PYTHON="${PYTHON_BIN:-python3}"
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
"$UPSCALER_PYTHON" -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11+ required"'
mkdir -p "$UPSCALER_HOME/models"
[ -x "$UPSCALER_HOME/venv/bin/python" ] || "$UPSCALER_PYTHON" -m venv "$UPSCALER_HOME/venv"
"$UPSCALER_HOME/venv/bin/python" -m pip install 'torch>=2.6,<3' 'numpy>=2,<3' 'Pillow>=10,<14' 'spandrel==0.4.2'
"$UPSCALER_HOME/venv/bin/python" - "$UPSCALER_HOME/models" <<'PY'
import hashlib
from pathlib import Path
import sys
from urllib.request import urlopen
models = Path(sys.argv[1])
weights = {
    'realesr-general-x4v3.pth': '8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292',
    'realesr-general-wdn-x4v3.pth': '1641f8c4464b9f097c9fdda5589273713f67cf59f3d909e0bd688f0cee269dca',
}
for name, expected in weights.items():
    target = models / name
    if target.exists():
        if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
            raise RuntimeError(f'Existing model has an unexpected checksum: {target}')
        continue
    url = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/' + name
    with urlopen(url, timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != expected:
        raise RuntimeError(f'Download checksum mismatch: {name}')
    # Never replace another process's completed download.
    with target.open('xb') as output:
        output.write(data)
    print(target)
PY
