import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { loadAssets } from '../web/runtime/loader.js';
import { verifyReceipt } from '../web/runtime/assets.js';

// Node tools use the same verified assets and pipeline as the browser Workers.
export function loadPackagedAssets() {
  return loadAssets({
    source: {
      readAsset: async (name) =>
        verifyReceipt(
          name,
          new Uint8Array(
            await readFile(new URL(`../web/assets/compiler/${name}`, import.meta.url)),
          ),
        ),
    },
    inflate: async (bytes) => new Uint8Array(gunzipSync(bytes)),
  });
}
