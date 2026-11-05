// loader.js — turn an asset source into what the engine needs.
//
// Every asset travels gzipped (the payload is about 26 MB compressed) and is
// inflated here. Which inflater is used is the caller's business -- the page has
// `DecompressionStream` and Node has `zlib` -- so it is handed in.
import { ASSET_RECEIPTS } from './asset-receipts.js';

const DECODER = new TextDecoder();

/** The assets the engine names directly; everything else is a library to link. */
const COMPILER = 'compiler.wasm.gz';
const LLD = 'lld.wasm.gz';
const STDLIB = 'stdlib.json.gz';

export async function loadAssets({ source, inflate, onStatus, onProgress }) {
  const names = Object.keys(ASSET_RECEIPTS);
  const libraries = names.filter((name) => name !== COMPILER && name !== LLD && name !== STDLIB);
  const wanted = [COMPILER, LLD, STDLIB, ...libraries];
  const total = wanted.reduce((sum, name) => sum + (ASSET_RECEIPTS[name]?.bytes ?? 0), 0);

  let loaded = 0;
  const read = async (name) => {
    const gzipped = await source.readAsset(name);
    loaded += gzipped.byteLength;
    onProgress?.(total ? Math.min(1, loaded / total) : 0);
    return inflate(gzipped);
  };

  onStatus?.(`the compiler (${megabytes(ASSET_RECEIPTS[COMPILER]?.bytes)})`);
  const compiler = await WebAssembly.compile(await read(COMPILER));

  onStatus?.(`the linker (${megabytes(ASSET_RECEIPTS[LLD]?.bytes)})`);
  const lld = await WebAssembly.compile(await read(LLD));

  onStatus?.('the standard library');
  const stdlib = JSON.parse(DECODER.decode(await read(STDLIB)));

  onStatus?.('the sysroot');
  // The libraries are keyed the way the linker asks for them -- `lib/libc.a`, not
  // `lib/libc.a.gz` -- because those keys become paths in the linker's filesystem.
  const libs = {};
  for (const name of libraries) libs[name.replace(/\.gz$/, '')] = await read(name);

  return { compiler, lld, stdlib, libs };
}

const megabytes = (bytes) => (bytes ? `${(bytes / 1e6).toFixed(1)} MB` : 'size unknown');
