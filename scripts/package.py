#!/usr/bin/env python3
"""Create a Git-ready source ZIP with prebuilt WASM, excluding restored dependencies."""
import argparse
import os
from pathlib import Path, PurePosixPath
import zipfile

ROOT = Path(__file__).resolve().parent.parent
EXCLUDED_DIRS = {'.git', '.cache', '__pycache__', 'node_modules', '.idea', '.vscode'}
EXCLUDED_TREES = {
    'dist', 'build',
    'vendor/crystal-src', 'vendor/crystal-browser-src',
    'web/vendor/prismjs', 'web/vendor/browser_wasi_shim', 'web/vendor/browser_wasi_shim.staging',
}
EXCLUDED_FILES = {'.env', '.env.local', '.DS_Store', 'Thumbs.db'}


def source_files():
    # Prune dependencies before walking them: a local LLVM build can be huge.
    for directory, dirs, files in os.walk(ROOT):
        parent = Path(directory)
        dirs[:] = sorted(name for name in dirs
                         if name not in EXCLUDED_DIRS
                         and not (parent == ROOT / 'vendor' and name.startswith('.source-'))
                         and not (parent == ROOT / 'web/traces' and name.startswith('.samples-'))
                         and (parent / name).relative_to(ROOT).as_posix() not in EXCLUDED_TREES
                         and not (parent / name).is_symlink())
        for name in sorted(files):
            path = parent / name
            rel = path.relative_to(ROOT)
            if path.is_symlink() or name in EXCLUDED_FILES:
                continue
            if path.suffix in {'.zip', '.log', '.pyc', '.pyo', '.swp', '.swo'}:
                continue
            if rel.parts[:2] == ('web', 'traces') and name.endswith('.json') and name != 'manifest.json':
                continue
            yield path, rel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, rel in source_files():
            archive.write(path, PurePosixPath('crystal-observatory') / rel.as_posix())
            count += 1
    with zipfile.ZipFile(args.output) as archive:
        bad = archive.testzip()
        if bad:
            raise SystemExit(f'ZIP integrity error: {bad}')
    print(f'{count} files; {args.output.stat().st_size:,} bytes: {args.output}')


if __name__ == '__main__':
    main()
