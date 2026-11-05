import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { loadPackagedAssets } from './compiler-assets.mjs';
import { compileSource } from '../web/runtime/compiler-pipeline.js';
import { validateTrace } from '../web/core/trace-model.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = join(root, 'web/traces');
const examples = (await readdir(join(root, 'examples')))
  .filter((name) => name.endsWith('.cr'))
  .sort();
// The manifest owns sample labels. Source text and recordings are regenerated.
const labels = new Map(
  JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8')).map((entry) => [
    basename(entry.trace, '.json.gz'),
    { title: entry.title, lesson: entry.lesson },
  ]),
);
const assets = await loadPackagedAssets();
const staging = await mkdtemp(join(destination, '.samples-'));
try {
  const manifest = [];
  for (const name of examples) {
    const stem = basename(name, '.cr');
    assert(labels.has(stem), `Add a label to web/traces/manifest.json for ${name}`);
    const source = await readFile(join(root, 'examples', name), 'utf8');
    const { trace, wasm } = await compileSource(source, assets);
    validateTrace(trace);
    assert.match(trace.compiler_version, /WASI/);
    if (stem === '08_type_error') {
      assert(trace.errors.length > 0, 'The type-error sample must produce a diagnostic');
      assert.match(trace.errors.join('\n'), /Int32#\+[\s\S]*not String/);
      assert.equal(wasm, undefined);
    } else {
      assert.deepEqual(trace.errors, [], name);
      assert.match(trace.target, /wasm32/);
      assert(wasm?.length > 0, `${name} must link successfully`);
    }
    trace.filename = name;
    for (const node of [...trace.nodes, ...trace.snapshots.flatMap((snapshot) => snapshot.nodes)]) {
      if (node.filename)
        node.filename = node.filename === '/main.cr' ? name : basename(node.filename);
    }
    const output = `${stem}.json.gz`;
    await writeFile(join(staging, output), gzipSync(Buffer.from(JSON.stringify(trace))));
    manifest.push({ ...labels.get(stem), trace: `./traces/${output}`, source });
    console.log(`${name}: ${trace.events.length} events, ${trace.nodes.length} nodes`);
  }
  await writeFile(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  // Compile every example before replacing any checked-in fixture.
  for (const name of await readdir(staging))
    await rename(join(staging, name), join(destination, name));
  console.log(`${manifest.length} WASM compiler traces exported`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
