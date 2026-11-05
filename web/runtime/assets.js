// Compressed compiler assets are pinned by digest before decompression.
import { ASSET_RECEIPTS } from './asset-receipts.js';
import { sha256Fallback } from './sha256.js';

/** sha256 of some bytes, as hex, using whatever the platform provides. */
async function sha256Hex(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return sha256Fallback(bytes);
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Check bytes against the pinned receipt for that asset — its length first, so a
 * truncated file is named without hashing it.
 *
 * @param {string} name - the asset's name in `ASSET_RECEIPTS`
 * @param {Uint8Array} bytes
 */
export async function verifyReceipt(name, bytes) {
  const receipt = ASSET_RECEIPTS[name];
  if (!receipt) throw new Error(`No pinned receipt for the compiler asset ${name}`);
  if (bytes.byteLength !== receipt.bytes) {
    throw new Error(
      `The compiler asset ${name} is ${bytes.byteLength} bytes, expected ${receipt.bytes}`,
    );
  }
  const digest = await sha256Hex(bytes);
  if (digest !== receipt.sha256) {
    throw new Error(
      `The compiler asset ${name} failed SHA-256 verification: expected ${receipt.sha256}, got ${digest}`,
    );
  }
  return bytes;
}

const resolveBaseUrl = (value) => {
  let resolved;
  try {
    resolved = new URL(String(value), typeof location === 'undefined' ? undefined : location.href);
  } catch (error) {
    throw new Error(
      `baseUrl must be an absolute http(s) URL, or relative to the page in a browser: ${error.message}`,
      { cause: error },
    );
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    throw new Error('baseUrl must use HTTP(S).');
  }
  if (!resolved.pathname.endsWith('/')) resolved.pathname += '/';
  return resolved;
};

export function createAssetSource(base) {
  const baseUrl = resolveBaseUrl(base);
  return {
    async readAsset(name) {
      const url = new URL(name, baseUrl);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to load the compiler asset ${url}: ${response.status}. ` +
            'Serve the web/assets/compiler directory shipped with Observatory.',
        );
      }
      return verifyReceipt(name, new Uint8Array(await response.arrayBuffer()));
    },
  };
}
