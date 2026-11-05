#!/usr/bin/env python3
"""Make a fresh patched build tree; reject stale build inputs instead of reusing them."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
from instrument_declarations import apply as instrument_declarations

ROOT = Path(__file__).resolve().parent.parent


def prepare(output):
    sources = json.loads((ROOT / 'deps/sources.lock.json').read_text())
    upstream = ROOT / sources['crystal-browser']['destination']
    patch = ROOT / sources['browser-port']['destination'] / 'apply-patches.py'
    fingerprint = {
        'crystal': sources['crystal-browser']['sha256'],
        'patch': hashlib.sha256(patch.read_bytes()).hexdigest(),
        'declarations': hashlib.sha256(
            (ROOT / 'scripts/instrument_declarations.py').read_bytes()).hexdigest(),
    }
    target = output / 'src'
    receipt = output / 'source-inputs.json'
    if target.exists():
        if receipt.is_file() and json.loads(receipt.read_text()) == fingerprint:
            return target
        raise ValueError(f'{target} uses unknown or stale inputs. Move this generated build '
                         'directory aside or set BROWSER_BUILD_DIR to a new directory.')
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output, prefix='prepare-') as temporary:
        tree = Path(temporary) / 'src'
        shutil.copytree(upstream, tree, symlinks=True)
        subprocess.run(['python3', str(patch), str(tree)], check=True)
        instrument_declarations(tree)
        tree.rename(target)
    receipt.write_text(json.dumps(fingerprint, indent=2) + '\n')
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    try:
        print(prepare(args.output.resolve()))
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'{error}\n')
