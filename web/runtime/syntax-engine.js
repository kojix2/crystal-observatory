import { validateSource } from '../core/limits.js';
// WASI Preview 1 subset for the syntax-only engine. Unsupported imports fail
// explicitly. No filesystem or subprocess imports are provided.
export async function instantiateSyntax(bytes) {
  let memory;
  let stderr = '',
    used = false;
  const view = () => new DataView(memory.buffer);
  const u32 = (p, n) => view().setUint32(p, n >>> 0, true);
  const wasi = {
    args_sizes_get: (a, b) => {
      u32(a, 0);
      u32(b, 0);
      return 0;
    },
    args_get: () => 0,
    environ_sizes_get: (a, b) => {
      u32(a, 0);
      u32(b, 0);
      return 0;
    },
    environ_get: () => 0,
    clock_time_get: (id, precision, p) => {
      view().setBigUint64(p, BigInt(Date.now()) * 1000000n, true);
      return 0;
    },
    random_get: (p, n) => {
      for (let i = 0; i < n; i += 65536)
        crypto.getRandomValues(new Uint8Array(memory.buffer, p + i, Math.min(65536, n - i)));
      return 0;
    },
    fd_write: (fd, iovs, count, written) => {
      let size = 0;
      for (let i = 0; i < count; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        size += len;
        if (fd === 2 && stderr.length < 8192)
          stderr += new TextDecoder().decode(
            new Uint8Array(memory.buffer, ptr, Math.min(len, 8192 - stderr.length)),
          );
      }
      u32(written, size);
      return 0;
    },
    fd_read: (fd, iovs, count, read) => {
      u32(read, 0);
      return 0;
    },
    fd_close: () => 0,
    fd_seek: () => 8,
    fd_fdstat_get: (fd, p) => {
      new Uint8Array(memory.buffer, p, 24).fill(0);
      view().setUint8(p, 2);
      return 0;
    },
    fd_prestat_get: () => 8,
    fd_prestat_dir_name: () => 8,
    path_open: () => 44,
    path_filestat_get: () => 44,
    fd_filestat_get: () => 8,
    fd_fdstat_set_flags: () => 0,
    sched_yield: () => 0,
    poll_oneoff: () => 58,
    proc_exit: (code) => {
      throw new Error(`WASI proc_exit(${code})`);
    },
  };
  const module = await WebAssembly.compile(bytes);
  const imports = { wasi_snapshot_preview1: {} };
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.module !== 'wasi_snapshot_preview1' || imp.kind !== 'function' || !wasi[imp.name])
      throw new Error(`Unsupported WASM import: ${imp.module}.${imp.name}`);
    imports.wasi_snapshot_preview1[imp.name] = wasi[imp.name];
  }
  const instance = await WebAssembly.instantiate(module, imports);
  const ex = instance.exports;
  memory = ex.memory;
  if (!memory) throw new Error('WASM memory export missing');
  if (ex.__main_argc_argv) ex.__main_argc_argv(0, 0);
  else if (ex._initialize) ex._initialize();
  else if (ex._start) ex._start();
  return (source) => {
    if (used) throw new Error('Create a fresh WASM instance for each analysis');
    used = true;
    const input = new TextEncoder().encode(source);
    validateSource(source);
    const p = input.length ? ex.lab_alloc(input.length) >>> 0 : 0;
    if (input.length && !p) throw new Error('WASM allocation failed');
    let trapped = false;
    const readOutput = (out) =>
      JSON.parse(
        new TextDecoder().decode(new Uint8Array(memory.buffer, out, ex.lab_last_len() >>> 0)),
      );
    try {
      new Uint8Array(memory.buffer, p, input.length).set(input);
      const out = ex.lab_analyze(p, input.length) >>> 0;
      return readOutput(out);
    } catch (error) {
      trapped = true;
      const out = ex.lab_last_ptr() >>> 0;
      if (out) {
        const trace = readOutput(out);
        if (trace.errors?.length) return trace;
      }
      throw new Error(stderr.trim() || error.message);
    } finally {
      // A trap can leave the Crystal/WASM stack inconsistent. Do not call back
      // into that instance to free memory: its one-shot Worker is discarded.
      if (p && !trapped) ex.lab_free(p);
    }
  };
}
