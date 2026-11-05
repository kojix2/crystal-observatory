#!/usr/bin/env python3
"""Restore pinned upstream sources; never silently overwrite an edited checkout."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import shutil
import stat
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
STAMP = '.observatory-source.json'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def extract(archive, spec, target):
    """Extract only the selected subtree, preserving internal upstream symlinks."""
    count = 0
    with zipfile.ZipFile(archive) as source:
        for member in source.infolist():
            if member.is_dir() or not member.filename.startswith(spec['prefix']):
                continue
            relative = member.filename[len(spec['prefix']):]
            if 'files' in spec and relative not in spec['files']:
                continue
            path = PurePosixPath(relative)
            if path.is_absolute() or '..' in path.parts or not relative:
                raise ValueError(f'Unsafe archive path: {relative}')
            dest = target.joinpath(*path.parts)
            # A preceding symlink must not redirect extraction outside the tree.
            if not dest.resolve().is_relative_to(target.resolve()):
                raise ValueError(f'Archive path escapes destination: {relative}')
            dest.parent.mkdir(parents=True, exist_ok=True)
            mode = member.external_attr >> 16
            data = source.read(member)
            if stat.S_ISLNK(mode):
                link = data.decode()
                resolved = posixpath.normpath(posixpath.join(str(path.parent), link))
                if link.startswith('/') or resolved == '..' or resolved.startswith('../'):
                    raise ValueError(f'Unsafe archive symlink: {relative}')
                dest.symlink_to(link)
            else:
                dest.write_bytes(data)
                dest.chmod(0o755 if mode & 0o111 else 0o644)
            count += 1
    if not count:
        raise ValueError('Archive contains no selected source files')


def install(name, spec, root, cache, offline=False):
    destination = root / spec['destination']
    stamp = destination / STAMP
    if destination.exists():
        if stamp.is_file() and json.loads(stamp.read_text()) == spec:
            print(f'{name}: already installed at {spec["revision"][:12]}')
            return
        raise ValueError(f'{destination} is unrecognized or uses another lock. '
                         'Move it aside (preserving local changes), then retry.')
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / f'{name}.zip'
    if not archive.is_file():
        if offline:
            raise ValueError(f'Missing cached archive: {archive}')
        # A failed download must never become a reusable cached archive.
        fd, temporary = tempfile.mkstemp(dir=cache, suffix='.download')
        try:
            with os.fdopen(fd, 'wb') as output, urllib.request.urlopen(spec['url'], timeout=60) as response:
                shutil.copyfileobj(response, output)
            if digest(Path(temporary)) != spec['sha256']:
                raise ValueError(f'{name}: downloaded archive SHA256 mismatch')
            os.replace(temporary, archive)
        finally:
            Path(temporary).unlink(missing_ok=True)
    if digest(archive) != spec['sha256']:
        raise ValueError(f'{name}: cached archive SHA256 mismatch: {archive}')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent, prefix='.source-') as temporary:
        tree = Path(temporary) / 'tree'
        tree.mkdir()
        extract(archive, spec, tree)
        (tree / STAMP).write_text(json.dumps(spec, indent=2) + '\n')
        tree.rename(destination)
    print(f'{name}: installed {spec["revision"][:12]} → {spec["destination"]}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('group', choices=['syntax', 'browser', 'all'], default='syntax', nargs='?')
    parser.add_argument('--offline', action='store_true', help='Use verified cached downloads only')
    args = parser.parse_args()
    sources = json.loads((ROOT / 'deps/sources.lock.json').read_text())
    try:
        for name, spec in sources.items():
            if args.group in ('all', spec['group']):
                install(name, spec, ROOT, ROOT / '.cache/downloads', args.offline)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
