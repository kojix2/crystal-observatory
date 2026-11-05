#!/usr/bin/env node
// Copy a locked npm dependency into the static site. No bundler or CDN at runtime.
import { readFile, readdir, copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'node_modules/@bjorn3/browser_wasi_shim');
const target = path.join(root, 'web/vendor/browser_wasi_shim');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const installed = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
if (installed.version !== pkg.dependencies['@bjorn3/browser_wasi_shim'])
  throw new Error('WASI shim version differs from package.json; run npm ci --ignore-scripts');
const staging = `${target}.staging`;
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
for (const file of await readdir(path.join(source, 'dist')))
  if (file.endsWith('.js'))
    await copyFile(path.join(source, 'dist', file), path.join(staging, file));
for (const file of ['LICENSE-APACHE', 'LICENSE-MIT'])
  await copyFile(path.join(source, file), path.join(staging, file));
// This directory is generated only; local runtime adaptations belong in web/runtime.
await rm(target, { recursive: true, force: true });
await rename(staging, target);
console.log(`Prepared browser_wasi_shim ${installed.version}`);

// Prism is a presentation dependency, separate from the compiler WASM.
const prism = path.join(root, 'node_modules/prismjs');
const prismTarget = path.join(root, 'web/vendor/prismjs');
const prismPackage = JSON.parse(await readFile(path.join(prism, 'package.json'), 'utf8'));
if (prismPackage.version !== pkg.dependencies.prismjs)
  throw new Error('Prism version differs from package.json; run npm ci --ignore-scripts');
await mkdir(prismTarget, { recursive: true });
for (const name of ['core', 'clike', 'ruby', 'crystal', 'llvm'])
  await copyFile(
    path.join(prism, `components/prism-${name}.min.js`),
    path.join(prismTarget, `prism-${name}.min.js`),
  );
await copyFile(path.join(prism, 'LICENSE'), path.join(prismTarget, 'LICENSE'));
console.log(`Prepared Prism ${prismPackage.version} (Crystal and LLVM grammars)`);
