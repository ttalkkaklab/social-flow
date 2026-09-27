#!/usr/bin/env python3
"""Install local Buzz operation hooks after review; preflight all edits, preserve backups."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

SOURCE = Path(__file__).resolve().parent


def prepare(home):
    changes = {}
    for edit in json.loads((SOURCE / 'runtime-edits.json').read_text()):
        path = home / edit['path']
        text = changes.get(path, path.read_text())
        if edit['new'] in text:
            continue
        if text.count(edit['old']) != 1:
            raise RuntimeError(f'local file changed; review hook manually: {path}')
        changes[path] = text.replace(edit['old'], edit['new'], 1)
    changes[home / 'bin/buzz-workflows.py'] = (SOURCE / 'buzz-workflows.py').read_text()
    for path, text in changes.items():
        if path.suffix == '.py':
            compile(text, str(path), 'exec')
        elif path.suffix == '.sh':
            subprocess.run(['bash', '-n'], input=text, text=True, check=True)
    return changes


def install(home, apply=False):
    (home / 'var/workflows').mkdir(parents=True, exist_ok=True)
    with (home / 'var/workflows/install.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        changes = prepare(home)
        if apply:
            backup = home / 'var/workflows/backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            for path, text in changes.items():
                if path.exists() and path.read_text() == text:
                    continue
                path.parent.mkdir(parents=True, exist_ok=True)
                if path.exists():
                    dest = backup / path.relative_to(home)
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(path, dest)
                with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as temp:
                    temp.write(text)
                candidate = Path(temp.name)
                candidate.chmod(path.stat().st_mode if path.exists() else 0o755)
                candidate.replace(path)
        return [str(p) for p in changes]


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', type=Path, default=Path.home() / '.buzz')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps({'applied': args.apply, 'files': install(args.home, args.apply)}, ensure_ascii=False))
