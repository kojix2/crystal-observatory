# Sources and third-party components

The MIT license at the repository root applies to original Observatory code.
The following components retain their upstream licenses and copyright notices.

| Component | Local location | Origin / snapshot |
|---|---|---|
| Crystal compiler and standard library | vendor/crystal-src, vendor/CRYSTAL-LICENSE, vendor/CRYSTAL-LICENSES | Fetched at commit `25b1e80df925f4b7a003f7455d79a1eccc39874f` (identical to user-supplied crystal-master(1).zip), 1.23.0-dev; Apache-2.0 WITH Swift-exception and per-file notices |
| WASI system libraries linked into syntax.wasm | build dependency; notices in vendor/WASM-NOTICES | kojix2/wasm-libs v0.0.5; wasi-libc, Boehm GC, PCRE2, compiler runtime; see their upstream notices |

Reference project: https://github.com/kojix2/astv.cr (user-supplied astv.cr-main.zip).
The current application and WASI adapter are separate implementations inspired
by its use of the actual Crystal syntax library in a browser.

Input/archive SHA256 values:

```
crystal-master(1).zip
b25ce644b59e3d3abce3dcd47702fff19ed8e0316a3bb21b7c3d3e72b1154460
astv.cr-main.zip
a04d85db2c3ed7f994adf9e44d2bc704bfaae6184d79f397c43bddd79d04a037
wasm32-wasi-sysroot.tar.gz v0.0.5
8b123e2b7103e330c7d1743649aa0738b5ec05023a48ba609205bced7f9f2eb8
```

The 1.23.0-dev compiler syntax sources are unmodified and used only for the
lightweight syntax WASM. Tracing is implemented by the separate src/lab adapters.
The complete browser compiler uses the patched 1.22.0 sources described below.

The WASM sysroot pins WASI SDK 30.0, BDWGC v8.2.10 and PCRE2 10.47.
WASI libc notices correspond to commit ec0effd769df5f05b647216578bcf5d3b5449725;
compiler-rt notices correspond to LLVM commit 222fc11f2b8f25f6a0f4976272ef1bb7bf49521d
(the WASI SDK 30 submodules). Exact notice source URLs are in vendor/WASM-NOTICES/SOURCES.txt.


## Complete browser compiler

- **live-codes/browser-crystal / @live-codes/crystal-wasm 0.4.0**, commit
  `daf9e56bfba0724e6fc689eff83f0e2415fab254`, MIT for the integration.
  https://github.com/live-codes/browser-crystal
  The package's WASI host, asset loader, linker/runtime assets and build patches
  are reused. `web/vendor/browser-crystal/LICENSE`, `web/vendor/browser-crystal/THIRD-PARTY-NOTICES.md` and
  `vendor/browser-crystal/LICENSE` preserve its notices.
- **Crystal 1.22.0**, Apache-2.0. The browser compiler is rebuilt from source with
  upstream browser-crystal's WASI/EH patches plus Observatory's separate tracing
  hooks. It replaces the package's original `compiler.wasm.gz`; its receipt is
  updated accordingly. The remaining runtime/LLD assets keep their upstream hashes.
- **@live-codes/llvm-wasm 0.1.0 / LLVM 20.1.8**, Apache-2.0 WITH LLVM-exception for
  LLVM and MIT for the package's compatibility code. Used at build time to link
  the browser compiler. https://github.com/live-codes/llvm-wasm
- **WASI SDK 33 runtime**, **LLD 22**, **PCRE2 10.42** and
  **browser_wasi_shim 0.4.2**: see `web/vendor/browser-crystal/THIRD-PARTY-NOTICES.md`.
  Full LLVM/Apache/MIT notices are also in `vendor/WASM-NOTICES/`.

The integration is a curated adaptation, not an installed copy of the npm API.
`web/runtime/wasi-command.js`, `wasi-file-growth.js`, `linker-args.js`, `loader.js`
and `assets.js` derive from browser-crystal under its MIT license. Unused
`compileAndRun`, Node packaged loading, Clang toolchain integration and package
entrypoints were removed. `web/vendor/browser_wasi_shim/` is generated verbatim from the locked `@bjorn3/browser_wasi_shim` 0.4.2 npm package (including both licenses). It is not checked into Git.
The geometric file growth adapter now also preserves logical EOF on reads and
trims spare capacity before resize/allocate. `web/runtime/sha256.js` supplies an
HTTP fallback; asset integrity checks remain enabled. The original package's
README/API is not shipped because our compiler has a different entrypoint.

`web/runtime/compiler-pipeline.js`, Worker coordination and UI modules are
Observatory code. `web/assets/compiler/compiler.wasm.gz` is rebuilt from our
instrumented entrypoint; `web/runtime/asset-receipts.js` records its new hash.
Other binary assets retain their upstream hashes. Rebuild with
`scripts/build-browser.sh`. Maintenance boundaries and workarounds are documented
in `docs/MAINTENANCE_JA.md`.

Pinned download SHA256:

```
@live-codes/llvm-wasm 0.1.0 npm archive
e75ec5b39a1750faa2792a6671dc917b5ea321a857d822daa39e1436e0551d75
browser-crystal archive addressed by commit (see deps/sources.lock.json)
1a9a7723ecdbaa42362f2be0a84d23e13a107a3f46969ca4e44f04b6de7f8c7c
wasi-sdk-33.0-x86_64-linux.tar.gz
0ba8b5bfaeb2adf3f29bab5841d76cf5318ab8e1642ea195f88baba1abd47bce
```


## Syntax highlighting

**Prism 1.30.0**, MIT, https://github.com/PrismJS/prism. The core, clike, Ruby and
Crystal grammar components are copied without modifications from the locked npm
package by `scripts/prepare-web.mjs`. The generated `web/vendor/prismjs/` includes
the upstream LICENSE and is excluded from Git and source ZIPs. `make web-deps`
restores it. No runtime CDN request is made. Observatory supplies the colors and
editable-text overlay; the real Crystal compiler still provides all diagnostics.

## Dependency restoration

Upstream Crystal sources and the browser port patch script are
restored by `scripts/fetch_sources.py` using `deps/sources.lock.json`. The lock
records source revisions, exact archive URLs, SHA256 digests and extraction
paths. Previously bundled upstream sources and build documentation are no
longer tracked. Licenses and prebuilt browser runtime assets remain included.
See `docs/DEPENDENCIES_JA.md` for the complete ownership and update policy.
