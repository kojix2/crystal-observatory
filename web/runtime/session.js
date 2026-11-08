import { LIMITS, validateSource } from '../core/limits.js';
import { WorkerClient, CancelledError } from './worker-client.js';

// Serializes compiler, syntax, execution and record loading. Cancellation is
// shared across all entrypoints, so a late record fetch cannot overwrite a compile.
export class WorkSession {
  constructor({ onState = () => {}, createWorker } = {}) {
    this.onState = onState;
    this.clients = {
      compile: new WorkerClient(new URL('../workers/compiler.js', import.meta.url), {
        reusable: true,
        createWorker,
      }),
      syntax: new WorkerClient(new URL('../workers/syntax.js', import.meta.url), { createWorker }),
      run: new WorkerClient(new URL('../workers/run.js', import.meta.url), { createWorker }),
    };
  }
  get busy() {
    return Boolean(this.active);
  }

  async perform(kind, operation) {
    this.cancel();
    const job = { kind, abort: new AbortController() };
    this.active = job;
    this.onState(kind);
    try {
      const result = await operation(job.abort.signal);
      if (this.active !== job) throw new CancelledError();
      return result;
    } catch (error) {
      if (this.active !== job) throw new CancelledError();
      throw error;
    } finally {
      if (this.active === job) {
        this.active = null;
        this.onState(null);
      }
    }
  }

  compile(source, onMessage, prelude = 'prelude') {
    validateSource(source);
    if (!['prelude', 'empty'].includes(prelude)) throw new TypeError('Invalid prelude selection');
    return this.perform('compile', () =>
      this.clients.compile.request({ source, prelude }, { timeout: LIMITS.compileMs, onMessage }),
    );
  }
  parse(source) {
    validateSource(source);
    return this.perform('syntax', () =>
      this.clients.syntax.request({ source }, { timeout: LIMITS.syntaxMs }),
    );
  }
  run(payload, onMessage) {
    return this.perform('run', () =>
      this.clients.run.request(payload, { timeout: LIMITS.runMs, onMessage }),
    );
  }
  load(operation) {
    return this.perform('load', operation);
  }

  cancel() {
    const job = this.active;
    if (!job) return false;
    this.active = null;
    job.abort.abort();
    this.clients[job.kind]?.cancel();
    // Stopping a program preserves the idle compiler's expensive asset cache.
    this.onState(null);
    return true;
  }
  dispose() {
    this.cancel();
    Object.values(this.clients).forEach((client) => client.dispose());
  }
}
