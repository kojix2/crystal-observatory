import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { compilerStage, compilerStages } from '../web/core/compiler-stages.js';

const recording = (name) =>
  JSON.parse(gunzipSync(readFileSync(new URL(`../web/traces/${name}.json.gz`, import.meta.url))));

test('pipeline order follows actual compiler boundaries, including stages with no Visitor', () => {
  const trace = recording('02_union_and_narrowing');
  const observed = trace.events.filter((event) => event.kind === 'phase_enter');
  assert.deepEqual(
    observed.map((event) => compilerStage(event)?.id),
    compilerStages.filter((stage) => stage.id !== 'link').map((stage) => stage.id),
  );
  const constructorEvents = trace.events.filter((event) => event.phase === 'Semantic (new)');
  assert.deepEqual(
    constructorEvents.map((event) => event.kind),
    ['phase_enter', 'phase_leave'],
  );
  assert.equal(compilerStage(constructorEvents[0]).driver, 'Program#define_new_methods');
  assert.equal(compilerStage({ phase: 'Semantic (type declarations)' }).output, 'variableTypes');
  assert.equal(compilerStage({ phase: 'Codegen (crystal)' }).id, 'codegen');
  assert.equal(compilerStage({ phase: 'Link (LLD)' }).id, 'link');
});

test('partial, error and syntax recordings do not invent later compiler stages', () => {
  const trace = recording('08_type_error');
  const stages = new Set(trace.events.map((event) => compilerStage(event)?.id));
  assert(stages.has('main'));
  assert(!stages.has('codegen'));
  assert(!stages.has('object'));
  assert.equal(compilerStage({ phase: 'Syntax walk (inspection)' }), undefined);
  assert.equal(
    compilerStage({ phase: 'Future phase', visitor: 'Crystal::MainVisitor' }),
    undefined,
  );
  assert.equal(compilerStage({ kind: 'complete', phase: '', detail: 'Parse' }), undefined);
});
