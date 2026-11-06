# Third-party components

Original Observatory code is MIT-licensed. Preserve the upstream licenses,
copyright notices and exceptions listed below when updating dependencies.

| Component | Origin and license | Preserved notices |
|---|---|---|
| Crystal compiler and standard library | [crystal-lang/crystal](https://github.com/crystal-lang/crystal); Apache-2.0 with applicable exceptions and per-file notices | `vendor/CRYSTAL-LICENSE`, `vendor/CRYSTAL-LICENSES/` |
| Browser compiler port and adapted runtime modules | [live-codes/browser-crystal](https://github.com/live-codes/browser-crystal), 0.4.0; MIT for the integration | `vendor/browser-crystal/LICENSE`, `web/vendor/browser-crystal/LICENSE`, `web/vendor/browser-crystal/THIRD-PARTY-NOTICES.md` |
| LLVM 20.1.8 and llvm-wasm compatibility code | [live-codes/llvm-wasm](https://github.com/live-codes/llvm-wasm), 0.1.0; Apache-2.0 WITH LLVM-exception and MIT for the compatibility code | `vendor/WASM-NOTICES/`, `web/vendor/browser-crystal/THIRD-PARTY-NOTICES.md` |
| WASI SDK runtimes, LLD, PCRE2 and Boehm GC | Component-specific licenses; exact source revisions and notices retained alongside the distribution | `vendor/WASM-NOTICES/`, `web/vendor/browser-crystal/THIRD-PARTY-NOTICES.md` |
| browser_wasi_shim | Apache-2.0 OR MIT | Both licenses copied into generated `web/vendor/browser_wasi_shim/` |
| Prism | [PrismJS/prism](https://github.com/PrismJS/prism); MIT | License copied into generated `web/vendor/prismjs/` |
| Lucide icons | [lucide-icons/lucide](https://github.com/lucide-icons/lucide), `lucide-static`; ISC | License copied into generated `web/vendor/lucide/`; only the glyphs named in `web/ui/icon-names.js` are extracted |

The full compiler uses patched Crystal 1.22.0; the lightweight syntax engine uses
the separately pinned 1.23.0-dev source. Source archive pins are in
`deps/sources.lock.json`; npm versions are in `package-lock.json`.

`wasi-command.js`, `wasi-file-growth.js`, `linker-args.js`, `loader.js` and
`assets.js` derive from browser-crystal. The distributed `compiler.wasm.gz` is
rebuilt with Observatory instrumentation rather than copied from that package.
The port patch's upstream commit and original hashes are recorded in
[`patches/README.md`](patches/README.md). Runtime asset receipts identify the
distributed binaries; build download checksums remain in the build scripts.
