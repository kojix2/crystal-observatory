import { UIError, errorPayload } from '../i18n/index.js';
import { instantiateSyntax } from '../runtime/syntax-engine.js';
self.onmessage = async ({ data }) => {
  try {
    const res = await fetch(new URL('../syntax.wasm', import.meta.url));
    if (!res.ok) throw new UIError('error.syntaxWasm');
    const analyze = await instantiateSyntax(await res.arrayBuffer());
    self.postMessage({ trace: analyze(data.source) });
  } catch (error) {
    self.postMessage(errorPayload(error));
  }
};
