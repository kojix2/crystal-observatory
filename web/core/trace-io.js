import { UIError } from '../i18n/index.js';
import { LIMITS } from './limits.js';

export async function decodeTrace(blob) {
  if (blob.size > LIMITS.traceBytes) throw new UIError('error.traceLimit');
  let bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const reader = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
      .getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > LIMITS.traceBytes) {
          await reader.cancel();
          throw new UIError('error.traceInflated');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function fetchTrace(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new UIError('error.traceFetch', { status: response.status });
  return decodeTrace(await response.blob());
}

export function emptyTrace(source) {
  return {
    schema_version: 1,
    compiler_version: '',
    mode: 'empty',
    source,
    filename: 'main.cr',
    tokens: [],
    nodes: [],
    events: [],
    snapshots: [],
    errors: [],
    llvm_ir: '',
  };
}
