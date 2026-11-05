import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sha256Fallback } from '../web/runtime/sha256.js';
import { verifyReceipt } from '../web/runtime/assets.js';
import { ASSET_RECEIPTS } from '../web/runtime/asset-receipts.js';

test('HTTP SHA-256 fallback matches native crypto at block/padding boundaries and on shipped assets', async () => {
  for (const size of [0, 1, 3, 55, 56, 63, 64, 65, 119, 120, 1000000]) {
    const input = new Uint8Array(size + 9).fill(97).subarray(9);
    assert.equal(sha256Fallback(input), createHash('sha256').update(input).digest('hex'));
  }
  for (const [name, receipt] of Object.entries(ASSET_RECEIPTS)) {
    const bytes = await readFile(new URL(`../web/assets/compiler/${name}`, import.meta.url));
    assert.equal(sha256Fallback(bytes), receipt.sha256, name);
  }
});

test('asset integrity rejects a same-length corrupt download', async () => {
  const name = 'compiler.wasm.gz';
  const bytes = await readFile(new URL(`../web/assets/compiler/${name}`, import.meta.url));
  bytes[100] ^= 1;
  await assert.rejects(verifyReceipt(name, bytes), /SHA-256 verification/);
});
