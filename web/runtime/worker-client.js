import { UIError } from '../i18n/index.js';
// One request per Worker. Only this class owns handlers, deadlines and disposal.
// A compiler Worker survives success to retain its compiled WASM modules; syntax
// and program Workers are disposable because guest memory must not survive runs.
export class CancelledError extends UIError {
  constructor() {
    super('notice.cancelled');
    this.name = 'CancelledError';
  }
}
export class TimeoutError extends UIError {
  constructor(ms) {
    super('error.timeout', { seconds: ms / 1000 });
    this.name = 'TimeoutError';
  }
}
export class WorkerClient {
  constructor(
    url,
    { reusable = false, createWorker = (url) => new Worker(url, { type: 'module' }) } = {},
  ) {
    this.url = url;
    this.reusable = reusable;
    this.createWorker = createWorker;
  }

  request(payload, { timeout, onMessage = () => {} } = {}) {
    this.cancel();
    return new Promise((resolve, reject) => {
      const job = { resolve, reject };
      this.pending = job;
      try {
        this.worker ||= this.createWorker(this.url);
        this.worker.onmessage = ({ data }) => {
          // A terminated Worker's queued message must never settle a newer job.
          if (this.pending !== job) return;
          try {
            if (data.error)
              this.finish(
                job,
                data.errorKey
                  ? new UIError(data.errorKey, data.errorValues)
                  : new Error(data.error),
              );
            else if (data.trace || data.done) this.finish(job, null, data);
            else onMessage(data);
          } catch (error) {
            this.finish(job, error, undefined, true);
          }
        };
        this.worker.onerror = (event) =>
          this.finish(
            job,
            event.message ? new Error(event.message) : new UIError('error.worker'),
            undefined,
            true,
          );
        this.worker.onmessageerror = () =>
          this.finish(job, new UIError('error.workerResult'), undefined, true);
        job.timer = setTimeout(
          () => this.finish(job, new TimeoutError(timeout), undefined, true),
          timeout,
        );
        this.worker.postMessage(payload);
      } catch (error) {
        this.finish(job, error, undefined, true);
      }
    });
  }

  finish(job, error, value, discard = false) {
    if (this.pending !== job) return;
    clearTimeout(job.timer);
    this.pending = null;
    if (this.worker) {
      this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null;
      if (discard || !this.reusable) {
        this.worker.terminate();
        this.worker = null;
      }
    }
    if (error) job.reject(error);
    else job.resolve(value);
  }

  cancel() {
    if (this.pending) this.finish(this.pending, new CancelledError(), undefined, true);
  }

  dispose() {
    this.cancel();
    this.worker?.terminate();
    this.worker = null;
  }
}
