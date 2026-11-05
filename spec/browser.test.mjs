import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPackagedAssets } from '../scripts/compiler-assets.mjs';
import { runCommand } from '../web/runtime/wasi-command.js';
import { compileSource } from '../web/runtime/compiler-pipeline.js';
import { TraceModel } from '../web/core/trace-model.js';

let assets;
before(async () => {
  assets = await loadPackagedAssets();
});

async function compile(code) {
  const result = await compileSource(code, assets);
  new TraceModel(result.trace);
  return result;
}
async function execute(result, stdin = '', args = []) {
  assert.deepEqual(result.trace.errors, []);
  assert.ok(result.wasm?.length > 1000);
  assert.ok(result.trace.llvm_ir.includes('define '));
  assert.ok(result.trace.events.some((e) => e.visitor.includes('MainVisitor')));
  assert.ok(result.trace.events.some((e) => e.visitor.includes('CodeGenVisitor')));
  const run = await runCommand(result.wasm, {
    args: ['program', ...args],
    stdin,
    stage: 'running',
  });
  assert.equal(run.exitCode, 0, run.stderr);
  return run.stdout;
}

test('arbitrary edited source drives actual semantics, LLVM, linking and execution', async () => {
  const source = 'def power_sum(x)\n  x * x + 13\nend\nputs power_sum(17)\nputs power_sum(2.5)\n';
  const result = await compile(source);
  assert.equal(result.trace.source, source);
  assert.match(result.trace.target, /wasm32/);
  assert.equal(await execute(result), '302\n19.25\n');
  const dispatches = result.trace.events
    .filter((e) => e.kind === 'dispatch')
    .map((e) => e.after)
    .join('\n');
  assert.match(dispatches, /power_sum\(Int32\)/);
  assert.match(dispatches, /power_sum\(Float64\)/);
});

test('macros generate traced AST; collections and Unicode execute', async () => {
  const result = await compile(
    'macro twice(x)\n  {{x}} + {{x}}\nend\nputs "結晶 #{twice(23)}"\nputs [3, 1, 4].sort.map { |n| n * n }.join(",")\n',
  );
  assert.equal(await execute(result), '結晶 46\n1,9,16\n');
  assert.ok(result.trace.events.some((e) => e.kind === 'expand'));
});

test('WASM exceptions unwind through rescue and ensure', async () => {
  const result = await compile(
    'begin\n  raise "boom"\nrescue ex : Exception\n  puts "caught: #{ex.message}"\nensure\n  puts "ensure"\nend\nputs "after"\n',
  );
  assert.equal(await execute(result), 'caught: boom\nensure\nafter\n');
});

test('stdin, argv and regex libraries are real WASI inputs', async () => {
  const result = await compile(
    'name = gets.not_nil!.strip\nputs "hello #{name}"\nputs ARGV.join(",")\nputs "a12b345".scan(/\\d+/).map(&.[0]).join(";")\n',
  );
  assert.equal(
    await execute(result, 'Crystal\n', ['first', 'second']),
    'hello Crystal\nfirst,second\n12;345\n',
  );
});

test('type and syntax errors return genuine diagnostics without an executable', async () => {
  const wrongType = await compile('puts 42 + "crystal"\n');
  assert.ok(wrongType.trace.errors.length);
  assert.match(wrongType.trace.errors.join('\n'), /String|Int32/);
  assert.equal(wrongType.wasm, undefined);
  const wrongSyntax = await compile('def broken(\n');
  assert.ok(wrongSyntax.trace.errors.length);
  assert.equal(wrongSyntax.wasm, undefined);
  const recovered = await compile('puts 731\n');
  assert.equal(await execute(recovered), '731\n');
});

test('fresh compilations never replay a previous source or executable', async () => {
  const first = await compile('puts 101\n');
  const second = await compile('puts 202\n');
  assert.equal(await execute(first), '101\n');
  assert.equal(await execute(second), '202\n');
  assert.notDeepEqual(first.wasm, second.wasm);
  assert.notEqual(first.trace.llvm_ir, second.trace.llvm_ir);
});

test('programs read back virtual files without observing spare buffer capacity', async () => {
  const result = await compile(
    'File.write("note.txt", "結晶")\nputs File.read("note.txt")\nputs File.size("note.txt")\n',
  );
  assert.equal(await execute(result), '結晶\n6\n');
});
