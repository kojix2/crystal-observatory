import { errorPayload } from '../i18n/index.js';
import { createAssetSource } from '../runtime/assets.js';
import { loadAssets } from '../runtime/loader.js';
import { compileSource } from '../runtime/compiler-pipeline.js';
let ready;
const inflate = async (bytes) =>
  new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer(),
  );
self.onmessage = async ({ data }) => {
  try {
    if (!ready)
      ready = loadAssets({
        source: createAssetSource(new URL('../assets/compiler/', import.meta.url).href),
        inflate,
        onStatus: (text) => self.postMessage({ status: 'loading', detail: text }),
        onProgress: (fraction) => self.postMessage({ progress: fraction }),
      }).catch((error) => {
        ready = null;
        throw error;
      });
    const assets = await ready;
    const result = await compileSource(
      data.source,
      assets,
      (status) => self.postMessage({ status }),
      { prelude: data.prelude },
    );
    self.postMessage(result, result.wasm ? [result.wasm.buffer] : []);
  } catch (error) {
    self.postMessage(errorPayload(error));
  }
};
