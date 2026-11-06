import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPackagedAssets } from '../scripts/compiler-assets.mjs';
import { runCommand } from '../web/runtime/wasi-command.js';
import { compileSource } from '../web/runtime/compiler-pipeline.js';
import { TraceModel, flattenAST } from '../web/core/trace-model.js';
import { readFile } from 'node:fs/promises';
import { LINKER_ARGS } from '../web/runtime/linker-args.js';
import { indexCompilerStages } from '../web/core/compiler-stages.js';

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

test('activity instrumentation preserves initialization and unused-block behavior', async () => {
  for (const [name, output] of [
    ['10_initializers', '20\n'],
    ['11_restrictions', '9\n'],
    ['12_guess_and_self', '1\n2.5\n'],
    ['13_missing_types', '7\nProc(Int32, NoReturn)\n5\n'],
    ['14_macro_control', '2\n5\n8\n'],
  ]) {
    const source = await readFile(
      new URL(`./fixtures/compiler/${name}.cr`, import.meta.url),
      'utf8',
    );
    const result = await compile(source);
    assert.equal(await execute(result), output, name);
    assert.equal(result.trace.truncated, false, name);
    assert(result.trace.activity_coverage.length > 0, name);
  }
});

test('failed declaration resolution and type guesses are not reported as successes', async () => {
  for (const [source, reason] of [
    ['class Broken\n @x : Missing\nend\n', 'resolution_failed'],
    ['class Broken\n @x = missing_method\nend\n', 'unresolved_or_forbidden_type'],
  ]) {
    const result = await compile(source);
    assert(result.trace.errors.length > 0);
    assert.equal(result.wasm, undefined);
    assert(
      result.trace.events.some(
        (e) => e.kind === 'activity' && e.reason === reason && e.after === '',
      ),
    );
  }
});

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
  const event = result.trace.events.at(-1);
  assert.equal(event.kind, 'link');
  assert.equal(indexCompilerStages(result.trace).get('link').first, event.index);
  assert.deepEqual(event.link.args.slice(0, LINKER_ARGS.length), LINKER_ARGS);
  assert.equal(event.link.elapsedMs, result.timings.link);
  assert(event.link.objectBytes > 0);
  assert.equal(event.link.outputBytes, result.wasm.byteLength);
  assert.equal(event.link.exitCode, 0);
  const restored = new TraceModel(JSON.parse(JSON.stringify(result.trace))).seek(event.index);
  assert.deepEqual(restored.event.link, event.link);
});

test('link failures retain the invocation and diagnostics in a selectable stage', async () => {
  const result = await compile(`
lib Missing
  fun observatory_missing : Int32
end
puts Missing.observatory_missing
`);
  assert.equal(result.wasm, undefined);
  assert(result.trace.errors.length > 0);
  const event = result.trace.events.at(-1);
  assert.equal(event.kind, 'link');
  assert.notEqual(event.link.exitCode, 0);
  assert.equal(event.link.outputBytes, null);
  assert.match(event.link.stderr, /observatory_missing/);
  assert.equal(indexCompilerStages(result.trace).get('link').first, event.index);
  assert.equal(new TraceModel(result.trace).seek(event.index).event, event);
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
  assert(!indexCompilerStages(wrongType.trace).has('link'));
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

test('declarations record actual type identity, hierarchy, registrations and macro provenance', async () => {
  const source = await readFile(
    new URL('./fixtures/compiler/09_declarations.cr', import.meta.url),
    'utf8',
  );
  const result = await compile(source);
  assert.equal(await execute(result), 'instance\nclass\n7\n8\nnine\n42\n');
  const trace = result.trace;
  assert.equal(trace.declarations_version, 1);
  const model = new TraceModel(trace);
  const type = (name) => {
    const info = trace.semantic_types.find((value) => value.name === name);
    assert(info, name);
    return info.id;
  };
  const child = type('Child'),
    parent = type('Parent');
  const events = trace.events.filter((event) => event.kind === 'declaration');
  const actions = (id, action) =>
    events.filter((event) => event.type_id === id && event.declaration_action === action);
  assert.equal(actions(child, 'type_create').length, 1);
  assert.equal(actions(child, 'type_reopen').length, 1);
  assert.equal(actions(child, 'inherit').length, 1);
  assert.equal(actions(child, 'inherit')[0].related_type_id, parent);
  assert.equal(actions(child, 'inherit')[0].implicit, false);
  assert.equal(actions(parent, 'inherit')[0].implicit, true);
  assert.equal(actions(child, 'include')[0].related_type_id, type('Named'));
  assert.equal(actions(child, 'extend')[0].related_type_id, type('FactoryLabel'));
  const methods = trace.definitions.filter((definition) => definition.owner_id === child);
  assert.equal(methods.length, 3);
  assert.equal(methods.filter((definition) => definition.class_method).length, 1);
  assert.equal(new Set(methods.map((definition) => definition.id)).size, 3);
  assert(methods.some((definition) => definition.signature.includes('String')));
  const generated = actions(type('Generated'), 'type_create')[0];
  assert(generated.origin_id > 0);
  assert(
    trace.events.some((event) => event.kind === 'expand' && event.node_id === generated.origin_id),
  );
  const creation = actions(child, 'type_create')[0];
  model.seek(creation.index - 1);
  assert.equal(model.declarations.has(child), false);
  model.seek(creation.index);
  assert.equal(model.declarations.get(child).methods.size, 0);
  model.seek(trace.events.length - 1);
  assert.equal(model.declarations.get(child).methods.size, 3);
  model.seek(creation.index - 1);
  assert.equal(model.declarations.has(child), false);
  assert.equal(trace.truncated, false);
});

test('declarations distinguish namespaces, structs, generic types and reopened library context', async () => {
  const result = await compile(`
module Outer
  class Item(T)
  end
  struct Value
  end
end
module Shared
  def priority; "shared"; end
end
module Other
  def priority; "other"; end
end
class Item
  include Shared
  include Other
  include Shared

  def capture(*args, **kwargs, &block)
    block.call
  end
end
class Outer::Item(T)
end
class String
  def observatory_marker
    17
  end
end
puts Item.new.priority
puts "ok".observatory_marker
`);
  assert.equal(await execute(result), 'other\n17\n');
  const trace = result.trace;
  const info = (name) => trace.semantic_types.find((type) => type.name === name);
  assert(info('Outer::Item(T)'));
  assert(info('Item'));
  assert.equal(info('Outer::Value').kind, 'struct');
  const replay = new TraceModel(trace).seek(trace.events.length - 1);
  const includes = replay.declarations.get(info('Item').id).includes;
  assert.deepEqual(
    includes.map((event) => event.related_type_id),
    [info('Other').id, info('Shared').id],
  );
  assert.match(
    trace.definitions.find((definition) => definition.name === 'capture').signature,
    /\*args.*\*\*kwargs.*&block/,
  );
  const events = trace.events.filter((event) => event.kind === 'declaration');
  const sharedIncludes = events.filter(
    (event) =>
      event.type_id === info('Item').id &&
      event.declaration_action === 'include' &&
      event.related_type_id === info('Shared').id,
  );
  assert.equal(sharedIncludes.length, 2);
  assert.equal(includes[1].index, sharedIncludes[0].index);
  const stringEvents = events.filter((event) => event.type_id === info('String').id);
  assert(!stringEvents.some((event) => event.declaration_action === 'type_create'));
  assert(stringEvents.some((event) => event.declaration_action === 'type_reopen'));
  const generic = events.filter((event) => event.type_id === info('Outer::Item(T)').id);
  assert.equal(generic.filter((event) => event.declaration_action === 'type_create').length, 1);
  assert.equal(generic.filter((event) => event.declaration_action === 'type_reopen').length, 1);
});

test('method redefinitions replace the actual earlier definition without removing overloads', async () => {
  const result = await compile(`
class Reopened
  def value(x : Int32)
    1
  end
  def value(x : String)
    3
  end
  def self.value(x : Int32)
    2
  end
end
class Reopened
  def value(x : Int32)
    previous_def + 10
  end
  def self.value(x : Int32)
    4
  end
end
puts Reopened.new.value(0)
puts Reopened.new.value("x")
puts Reopened.value(0)
`);
  assert.equal(await execute(result), '11\n3\n4\n');
  const trace = result.trace;
  const type = trace.semantic_types.find((value) => value.name === 'Reopened');
  const definitions = new Map(trace.definitions.map((definition) => [definition.id, definition]));
  const methods = trace.events.filter(
    (event) =>
      event.kind === 'declaration' &&
      event.declaration_action === 'method' &&
      event.type_id === type.id,
  );
  assert.equal(methods.length, 5);
  assert.equal(methods[3].replaced_definition_id, methods[0].definition_id);
  assert.equal(methods[4].replaced_definition_id, methods[2].definition_id);
  const replay = new TraceModel(trace).seek(methods[2].index);
  assert.deepEqual(
    [...replay.declarations.get(type.id).methods.keys()],
    [methods[0].definition_id, methods[1].definition_id, methods[2].definition_id],
  );
  replay.seek(methods[4].index);
  const current = [...replay.declarations.get(type.id).methods.keys()];
  assert.deepEqual(current, [
    methods[1].definition_id,
    methods[3].definition_id,
    methods[4].definition_id,
  ]);
  assert.equal(current.filter((id) => definitions.get(id).class_method).length, 1);
  replay.seek(methods[2].index);
  assert(replay.declarations.get(type.id).methods.has(methods[0].definition_id));
  assert(!replay.declarations.get(type.id).methods.has(methods[3].definition_id));
});

test('hook-generated methods remain reachable through actual hook expansion snapshots', async () => {
  const result = await compile(`
module Hooked
  macro included
    def from_include; 1; end
  end
  macro extended
    def self.from_extend; 2; end
  end
end
class Parent
  macro inherited
    def from_inherited; 3; end
  end
end
class Child < Parent
  include Hooked
  extend Hooked
  macro method_added(method)
    {% if method.name == "explicit" %}
      def from_method_hook; 4; end
    {% end %}
  end
  def explicit; 5; end
end
puts Child.new.from_include + Child.from_extend + Child.new.from_inherited + Child.new.from_method_hook + Child.new.explicit
`);
  assert.equal(await execute(result), '15\n');
  const trace = result.trace;
  const model = new TraceModel(trace);
  for (const name of ['from_include', 'from_extend', 'from_inherited', 'from_method_hook']) {
    const definition = trace.definitions.find((item) => item.name === name);
    assert(definition, name);
    const event = trace.events.find(
      (item) => item.kind === 'declaration' && item.definition_id === definition.id,
    );
    assert(event, name);
    model.seek(event.index);
    const snapshotIndex = model.snapshotForNode(event.node_id);
    assert(snapshotIndex >= 0, name);
    const rows = flattenAST(trace.snapshots[snapshotIndex]);
    let row = rows.findIndex((item) => item.node.id === event.node_id);
    let followsHook = false;
    while (row >= 0) {
      followsHook ||= rows[row].edge === 'hook';
      row = rows[row].parent;
    }
    assert(followsHook, name);
  }
});

test('failed declarations retain completed operations without reporting a failed type or include', async () => {
  const result = await compile(`
class BeforeFailure
end
class BeforeFailure < String
end
`);
  assert(result.trace.errors.length);
  const id = result.trace.semantic_types.find((type) => type.name === 'BeforeFailure').id;
  const events = result.trace.events.filter(
    (event) => event.kind === 'declaration' && event.type_id === id,
  );
  assert.equal(events.filter((event) => event.declaration_action === 'type_create').length, 1);
  assert.equal(events.filter((event) => event.declaration_action === 'type_reopen').length, 0);
  assert.equal(result.wasm, undefined);
  const invalidInclude = await compile('class Wrong\n  include Int32\nend\n');
  assert(invalidInclude.trace.errors.length);
  assert(!invalidInclude.trace.events.some((event) => event.declaration_action === 'include'));
});
