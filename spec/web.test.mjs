import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { TraceModel, validateTrace, flattenAST, indexIR } from '../web/core/trace-model.js';
import { instantiateSyntax } from '../web/runtime/syntax-engine.js';
const root = path.resolve(import.meta.dirname, '..');
const wasm = fs.readFileSync(path.join(root, 'web/syntax.wasm'));
const load = (name) =>
  JSON.parse(gunzipSync(fs.readFileSync(path.join(root, `web/traces/${name}.json.gz`))));

test('real compiler traces have coherent references, balanced visits, and verified IR', () => {
  const files = fs.readdirSync(path.join(root, 'web/traces')).filter((f) => f.endsWith('.json.gz'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'web/traces/manifest.json'), 'utf8'));
  const examples = fs
    .readdirSync(path.join(root, 'examples'))
    .filter((f) => f.endsWith('.cr'))
    .sort();
  assert.equal(files.length, examples.length);
  assert.deepEqual(
    manifest.map((item) => path.basename(item.trace, '.json.gz') + '.cr'),
    examples,
  );
  for (const item of manifest) {
    const name = path.basename(item.trace, '.json.gz');
    const source = fs.readFileSync(path.join(root, 'examples', `${name}.cr`), 'utf8');
    assert.equal(item.source, source);
    assert.equal(load(name).source, source);
  }
  for (const f of files) {
    const t = validateTrace(
      JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'web/traces', f)))),
    );
    assert.equal(t.truncated, false, f);
    assert.match(t.compiler_version, /WASI/, f);
    const stack = [];
    for (const e of t.events) {
      if (['visit_enter', 'transform_enter'].includes(e.kind)) stack.push([e.node_id, e.visitor]);
      if (['visit_leave', 'transform_leave'].includes(e.kind))
        assert.deepEqual(stack.pop(), [e.node_id, e.visitor], f);
    }
    assert.equal(stack.length, 0, f);
    if (f.endsWith('_type_error.json.gz')) {
      assert(t.errors.length > 0);
      assert.equal(t.llvm_ir, '');
    } else {
      assert.match(t.target, /wasm32/, f);
      assert.deepEqual(t.errors, []);
      assert(indexIR(t.llvm_ir).some((f) => f.name === '__crystal_main'));
    }
    for (const s of t.snapshots) assert(flattenAST(s).length <= s.nodes.length * 3);
  }
});
test('seeking backwards restores types and observer edges', () => {
  const t = load('06_union_and_narrowing'),
    m = new TraceModel(t);
  const union = t.events.findIndex(
    (e) => e.kind === 'type' && e.after.includes('Int32') && e.after.includes('String'),
  );
  assert(union >= 0);
  m.seek(union);
  const before = JSON.stringify([...m.types]);
  m.seek(t.events.length - 1);
  m.seek(union);
  assert.equal(JSON.stringify([...m.types]), before);
  const e = t.events.find((e) => e.kind === 'bind');
  assert(e);
  m.seek(e.index - 1);
  const old = m.edges.has(`${e.related_id}:${e.node_id}`);
  m.seek(e.index);
  assert(m.edges.has(`${e.related_id}:${e.node_id}`));
  m.seek(e.index - 1);
  assert.equal(m.edges.has(`${e.related_id}:${e.node_id}`), old);
});
test('macro expansion and typed method resolution are observed, not invented', () => {
  const macro = load('09_macro_expansion');
  assert(macro.events.some((e) => e.kind === 'expand' && e.after.includes('3 * 3')));
  assert(macro.snapshots.some((s) => s.nodes.some((n) => n.expanded)));
  const overloads = load('04_overloads');
  assert(
    overloads.events.some((e) => e.kind === 'dispatch' && e.after.includes('identity(Int32)')),
  );
  assert(
    overloads.events.some((e) => e.kind === 'dispatch' && e.after.includes('identity(Float64)')),
  );
  assert(overloads.events.some((e) => e.kind === 'ir' && e.llvm_function));
});
test('WASM parses Unicode, interpolation, macros, and reports syntax errors', async () => {
  for (const source of [
    '名前 = "結晶"\n"#{名前}"\n',
    'macro pair(x)\n{{x}} + {{x}}\nend\npair(3)\n',
    'require "prelude"\n%w(a b)\n',
  ]) {
    const run = await instantiateSyntax(wasm);
    const t = validateTrace(run(source));
    assert.equal(t.mode, 'syntax');
    assert.deepEqual(t.errors, []);
    assert(t.nodes.length > 0);
    assert(t.events.some((e) => e.visitor === 'Observatory::SyntaxWalkVisitor'));
    assert.equal(t.llvm_ir, '');
    assert(!t.events.some((e) => e.kind === 'type'));
  }
  const run = await instantiateSyntax(wasm);
  const bad = validateTrace(run('def broken(\n'));
  assert(bad.errors.some((e) => e.includes('input.cr:2:1: unexpected token: EOF')));
  assert.throws(() => run('42'), /fresh WASM instance/);
});
test('invalid trace IDs and ordering are rejected before replay', () => {
  const t = load('03_specialization');
  t.events[0].node_id = 999999;
  assert.throws(() => validateTrace(t));
});

test('syntax WASM records complete string array tokens with their lexer mode', async () => {
  const run = await instantiateSyntax(wasm);
  const trace = validateTrace(run('%w(one two)\n%i(three four)\n'));
  assert.deepEqual(trace.errors, []);
  const tokens = trace.tokens.filter((token) => token.kind === 'STRING');
  assert.deepEqual(
    tokens.map((token) => token.value),
    ['one', 'two', 'three', 'four'],
  );
  assert(tokens.every((token) => token.mode === 'string array'));
});

test('prelude metadata preserves old recordings and rejects non-text values', () => {
  const trace = load('03_specialization');
  delete trace.prelude;
  assert.equal(validateTrace(trace).prelude, undefined);
  trace.prelude = 'custom';
  assert.equal(validateTrace(trace).prelude, 'custom');
  trace.prelude = { name: 'empty' };
  assert.throws(
    () => validateTrace(trace),
    (error) => error.key === 'error.traceSchema',
  );
});
