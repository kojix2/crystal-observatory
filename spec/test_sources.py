import importlib.util
import json
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
loader = importlib.util.spec_from_file_location('fetch_sources', ROOT / 'scripts/fetch_sources.py')
fetch = importlib.util.module_from_spec(loader)
loader.loader.exec_module(fetch)


class SourceInstallTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.cache = self.root / 'cache'
        self.cache.mkdir()
        self.archive = self.cache / 'example.zip'
        with zipfile.ZipFile(self.archive, 'w') as archive:
            archive.writestr('upstream/src/hello.cr', 'puts "hello"\n')
            archive.writestr('upstream/README.md', 'Not part of the requested subtree')
            link = zipfile.ZipInfo('upstream/src/link.cr')
            link.create_system = 3
            link.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(link, 'hello.cr')
        self.spec = dict(revision='a' * 40, sha256=fetch.digest(self.archive),
                         prefix='upstream/src/', destination='vendor/example')

    def test_cached_install_preserves_links_and_never_overwrites_local_edits(self):
        fetch.install('example', self.spec, self.root, self.cache, offline=True)
        target = self.root / 'vendor/example'
        self.assertFalse((target / 'README.md').exists())
        self.assertTrue((target / 'link.cr').is_symlink())
        (target / 'hello.cr').write_text('local edit')
        fetch.install('example', self.spec, self.root, self.cache, offline=True)
        self.assertEqual((target / 'link.cr').read_text(), 'local edit')
        self.assertEqual(json.loads((target / fetch.STAMP).read_text()), self.spec)

    def test_corrupt_cache_leaves_no_partial_install(self):
        self.archive.write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'SHA256 mismatch'):
            fetch.install('example', self.spec, self.root, self.cache, offline=True)
        self.assertFalse((self.root / 'vendor/example').exists())

    def test_unknown_or_old_source_tree_requires_explicit_migration(self):
        target = self.root / 'vendor/example'
        target.mkdir(parents=True)
        (target / 'hello.cr').write_text('keep me')
        with self.assertRaisesRegex(ValueError, 'unrecognized'):
            fetch.install('example', self.spec, self.root, self.cache, offline=True)
        self.assertEqual((target / 'hello.cr').read_text(), 'keep me')

    def test_archive_cannot_escape_the_install_directory(self):
        for name, content, symlink in [('upstream/src/../../outside', 'x', False),
                                       ('upstream/src/link', '../../outside', True)]:
            with self.subTest(name=name):
                with zipfile.ZipFile(self.archive, 'w') as archive:
                    member = zipfile.ZipInfo(name)
                    if symlink:
                        member.create_system = 3
                        member.external_attr = (stat.S_IFLNK | 0o777) << 16
                    archive.writestr(member, content)
                self.spec['sha256'] = fetch.digest(self.archive)
                with self.assertRaises(ValueError):
                    fetch.install('example', self.spec, self.root, self.cache, offline=True)
                self.assertFalse((self.root / 'vendor/example').exists())
                self.assertFalse((self.root / 'outside').exists())


if __name__ == '__main__':
    unittest.main()
