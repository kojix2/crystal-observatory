import { UIError, errorPayload } from '../i18n/index.js';
import { LIMITS } from '../core/limits.js';
import { runCommand } from '../runtime/wasi-command.js';
self.onmessage = async ({ data }) => {
  let bytes = 0,
    pending = '',
    sent = false;
  const flush = () => {
    if (pending) {
      self.postMessage({ output: pending });
      pending = '';
    }
  };
  const output = (text) => {
    bytes += new TextEncoder().encode(text).length;
    if (bytes > LIMITS.outputBytes) throw new UIError('error.output');
    pending += text;
    if (!sent || pending.length >= 4096) {
      flush();
      sent = true;
    }
  };
  try {
    const started = performance.now();
    const result = await runCommand(data.wasm, {
      args: ['program', ...data.args],
      stdin: data.stdin,
      entries: [],
      stage: 'running',
      onStdout: output,
      onStderr: output,
    });
    flush();
    self.postMessage({
      done: true,
      exitCode: result.exitCode,
      elapsed: performance.now() - started,
    });
  } catch (error) {
    flush();
    self.postMessage(errorPayload(error));
  }
};
