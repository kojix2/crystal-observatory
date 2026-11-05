import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
loader = importlib.util.spec_from_file_location(
    'instrument_activities', ROOT / 'scripts/instrument_activities.py')
instrumentation = importlib.util.module_from_spec(loader)
loader.loader.exec_module(instrumentation)


class ActivityInstrumentationTest(unittest.TestCase):
    def test_pinned_sources_match_once_and_reject_duplicate_instrumentation(self):
        root = ROOT / 'vendor/crystal-browser-src/compiler/crystal'
        if not root.exists():
            self.skipTest('Run make browser-deps to restore pinned compiler sources')
        for name, changes in instrumentation.changes().items():
            with self.subTest(file=name):
                source = (root / name).read_text()
                result = instrumentation.instrument(source, changes, name)
                self.assertIn('flag?(:lab_full)', result)
                with self.assertRaises(ValueError):
                    instrumentation.instrument(result, changes, name)
                with self.assertRaises(ValueError):
                    instrumentation.instrument(source + source, changes, name)

    def test_mismatch_does_not_partially_write_build_tree(self):
        with tempfile.TemporaryDirectory() as directory:
            tree = Path(directory)
            for name in instrumentation.changes():
                path = tree / 'compiler/crystal' / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('unknown compiler source')
            with self.assertRaisesRegex(ValueError, 'expected one source match'):
                instrumentation.apply(tree)
            for path in tree.rglob('*.cr'):
                self.assertEqual(path.read_text(), 'unknown compiler source')
