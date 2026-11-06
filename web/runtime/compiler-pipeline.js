import { LIMITS, validateSource } from '../core/limits.js';
// The compiler, LLVM and LLD are WASM modules. All files stay in memory.
import { runCommand, stripAnsi } from './wasi-command.js';
import { LINKER_ARGS } from './linker-args.js';

export async function compileSource(source, assets, onStage = () => {}) {
  validateSource(source);
  const entries = [['main.cr', source]];
  for (const [path, text] of Object.entries(assets.stdlib)) entries.push([`src/${path}`, text]);
  onStage('compiling');
  const started = performance.now();
  const compiled = await runCommand(assets.compiler, {
    args: ['observatory'],
    env: ['CRYSTAL_PATH=/src:/'],
    entries,
    stage: 'compiling',
  });
  const traceFile = compiled.root.contents.get('trace.json');
  if (!traceFile)
    throw new Error(
      stripAnsi(compiled.stderr || compiled.stdout) ||
        `Compiler exited ${compiled.exitCode} without a trace`,
    );
  const trace = JSON.parse(new TextDecoder().decode(traceFile.data));
  const timings = { compile: performance.now() - started };
  if (trace.errors.length || compiled.exitCode !== 0) return { trace, timings };
  const object = compiled.root.contents.get('out.o.wasm')?.data;
  if (!object) throw new Error('LLVM did not emit a WebAssembly object');
  onStage('linking');
  const args = [
    ...LINKER_ARGS,
    `--max-memory=${LIMITS.programMemoryBytes}`,
    '-z',
    `stack-size=${LIMITS.programStackBytes}`,
  ];
  const linkStart = performance.now();
  const linked = await runCommand(assets.lld, {
    args,
    entries: [['out.o.wasm', object], ...Object.entries(assets.libs)],
    stage: 'linking',
  });
  timings.link = performance.now() - linkStart;
  const wasm = linked.root.contents.get('out.wasm')?.data;
  // This observes one browser-side invocation, not LLD's internal operations.
  // Keep the result in the trace so exported recordings retain the link details.
  trace.events.push({
    index: trace.events.length,
    kind: 'link',
    phase: 'Link (LLD)',
    visitor: 'LLD',
    node_id: 0,
    detail: '',
    link: {
      args,
      objectBytes: object.byteLength,
      elapsedMs: timings.link,
      exitCode: linked.exitCode,
      outputBytes: wasm?.byteLength ?? null,
      stdout: stripAnsi(linked.stdout),
      stderr: stripAnsi(linked.stderr),
    },
  });
  if (!wasm || linked.exitCode !== 0) {
    trace.errors.push(stripAnsi(linked.stderr || linked.stdout) || `LLD exited ${linked.exitCode}`);
    return { trace, timings };
  }
  return { trace, wasm, timings };
}
