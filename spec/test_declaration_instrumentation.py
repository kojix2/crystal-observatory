import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
loader = importlib.util.spec_from_file_location(
    'instrument_declarations', ROOT / 'scripts/instrument_declarations.py')
instrumentation = importlib.util.module_from_spec(loader)
loader.loader.exec_module(instrumentation)


class DeclarationInstrumentationTest(unittest.TestCase):
    def test_unknown_sources_fail_explicitly_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            tree = Path(directory)
            path = tree / 'compiler/crystal/semantic/top_level_visitor.cr'
            path.parent.mkdir(parents=True)
            path.write_text('unknown compiler source')
            with self.assertRaisesRegex(ValueError, 'expected one source match'):
                instrumentation.apply(tree)
            self.assertEqual(path.read_text(), 'unknown compiler source')

    def test_pinned_source_is_instrumented_and_duplicate_application_rejected(self):
        path = ROOT / 'vendor/crystal-browser-src/compiler/crystal/semantic/top_level_visitor.cr'
        if not path.exists():
            self.skipTest('Run make browser-deps to restore pinned compiler sources')
        source = path.read_text()
        result = instrumentation.instrument(source)
        self.assertEqual(result.count('rec.declare_type('), 1)
        self.assertEqual(result.count('&.declare_type('), 1)
        self.assertIn('if created_new_type', result)
        self.assertIn('current_type.as(ModuleType).include type\n      {% if', result)
        self.assertIn('previous_definition = target_type.add_def node\n    {% if', result)
        self.assertIn('declare_method(node, target_type, previous_definition)', result)
        self.assertEqual(result.count('flag?(:lab_full)'), 4)
        with self.assertRaises(ValueError):
            instrumentation.instrument(result)
