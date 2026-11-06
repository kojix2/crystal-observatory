# Maintenance Guide

This version preserves in-browser compilation while assigning clear ownership to each component. Trace JSON remains schema 1. The UI has History on the left, Source/AST tabs in the center, and node details above Visitor/operation details on the right. The header is one 40 px row; there is no separate row of stage tabs. English is the default, and the selected JA/EN language is saved. `web/` can be served statically without a JavaScript bundling step.

## Where to make changes

| Change | Owner | Boundary |
|---|---|---|
| Dependency restoration | `deps/sources.lock.json`, `scripts/fetch_sources.cr`, `scripts/prepare-web.mjs` | Do not duplicate upstream sources in Git; see [DEPENDENCIES.md](DEPENDENCIES.md) |
| Application startup | `web/app.js` | Wires the Application and layout together |
| Compile, run, parse, and open trace actions | `web/ui/application.js` | Coordinates user actions; does not create Workers directly |
| Playback, node selection, and view tabs | `web/ui/trace-view.js` | Presents traces; does not launch the compiler |
| Individual views | `web/ui/source-editor.js`, `graphs.js`, `inspector.js`, `event-list.js`, `ir-view.js`, `tokens.js` | No compile or Worker state |
| Syntax highlighting | `web/core/crystal-highlight.js`, `scripts/prepare-web.mjs` | Uses pinned Prism Crystal grammar; not used for type or diagnostic decisions |
| Event explanations | `web/ui/event-labels.js`, `web/i18n/messages.js` | Separates general Visitor roles from measured values; unknown roles are not guessed |
| Layout | `web/ui/workspace.js`, `web/style.css` | Independent of traces and compiler state |
| Width allocation and minimum widths | `web/core/layout.js` | DOM-independent; handles pane proportions and adjacent-pane resizing |
| Translation dictionary and error keys | `web/i18n/messages.js`, `index.js` | Shared JA/EN keys; independent of DOM and storage |
| Language setting and UI rerendering | `web/ui/language.js` | Updates `data-i18n` attributes and status messages; does not reload the trace |
| Trace validation and rewind | `web/core/trace-model.js` | Independent of DOM, Workers, and fetch |
| JSON/gzip input | `web/core/trace-io.js` | Enforces size limits and decodes; caller owns rendering |
| Time, output, and memory limits | `web/core/limits.js` | Centralizes browser limits; Crystal also enforces its input limit |
| Async-operation cancellation and races | `web/runtime/session.js` | Runs one compile, parse, execution, or trace load at a time |
| Worker lifecycle and deadlines | `web/runtime/worker-client.js` | Centralizes event handlers, timers, and Promise completion |
| Worker entrypoints | `web/workers/` | Adapts messages to processing modules |
| Compilation and linking | `web/runtime/compiler-pipeline.js`, `linker-args.js` | Connects the compiler and LLD using in-memory files |
| WASI command execution | `web/runtime/wasi-command.js` | WASI host, standard I/O, and in-memory files |
| Compressed asset loading and verification | `web/runtime/assets.js`, `loader.js`, `asset-receipts.js`, `sha256.js` | Verifies hashes before decompression and Module creation |
| Binary assets | `web/assets/compiler/`, `web/syntax.wasm` | Rebuilt or generated from pinned upstream assets |
| Unmodified WASI host | `web/vendor/browser_wasi_shim/` | Kept identical to upstream |
| Full compiler | `src/lab/compilation.cr` | Recorder lifetime, semantic analysis, LLVM verification/output, and diagnostics |
| WASI I/O and settings | `src/browser_trace.cr` | Input, target configuration, and output serialization |
| Observation hooks | `src/lab/hooks.cr`, `full_hooks.cr` | Preserve upstream behavior through `previous_def`, then record results |
| Declaration operations | `scripts/instrument_declarations.cr`, `src/lab/full_hooks.cr` | Instruments successful mutation points in the pinned compiler; records semantic type IDs and owners separately from AST expression types |
| Declaration replay and UI | `web/core/declarations.js`, `web/ui/declarations.js` | Displays state at the selected event; manually selecting types/nodes does not seek |

## Async-operation guarantees

`WorkSession` runs one operation at a time. Switching operations terminates the previous Worker or aborts a trace fetch. Operations that cannot be interrupted mid-flight, such as JSON decompression, check that they are still current before returning, so stale results are discarded.

Only `WorkerClient` manages Worker event handlers, timers, and termination. The compiler Worker can be reused after a successful operation, but each analysis gets a new WASM instance. Only the Module and standard-library assets are cached. Syntax parsing and generated-program Workers are disposable. Cancelling a program must not discard the waiting compiler assets.

Workers send intermediate `status`, `progress`, and `output` messages, then `trace` or `done` on success and `error` on failure. Observatory `UIError`s also carry `errorKey` and `errorValues`, which the receiver localizes using the current language. Compiler diagnostics are displayed verbatim. If adding a message type, update WorkerClient completion logic and its tests.

Application stores generated WASM together with its input source. If the editor changes while a job runs, the result must not overwrite the new source. WASM is not automatically run or rerun if its source differs from the editor. Example source comes directly from the manifest; the large bundled LLVM trace is fetched only when **Example trace** is selected.

## Layout and display language

`core/layout.js` handles the four pane ratios (22 / 36 / 18 / 24) and minimum widths (170 / 260 / 180 / 240 px). `workspace.js` measures actual widths and wires dragging, keyboard resizing, maximizing, and collapsing. The old version stored the History **height**, so column widths are stored separately under `crystal-observatory.workspace.v3`.

Use HTML `data-i18n` for fixed labels, `data-i18n-title` for tooltips, and `data-i18n-aria` for aria labels. Register dynamic text with `text(id, () => t(key, values))` or `notify(() => t(key, values))` so it updates on language changes. Registration uses a fixed ID and replaces the previous value rather than accumulating entries.

`TraceView.localize()` redraws the current trace when the language changes. Do not call `load()` or `seek()`: they can change manually selected nodes, snapshots, or filters. Pass live-analysis state explicitly through the `live` value rather than comparing localized strings. When adding a translation, keep both languages and placeholders aligned and run `spec/i18n.test.mjs`.

## Retained workarounds

| Location | Why it is needed | Checks before changing/removing |
|---|---|---|
| `Crystal::Type#to_s : String` in `src/lab/full_hooks.cr` | Calling it to observe a type would otherwise create a compiler return-type inference cycle | Build the full WASM without an explicit method return type; verify semantic analysis, type changes, and IR generation |
| The two `set_type` overloads in the same file | Correctly dispatch `previous_def` to the upstream `Type` and `Nil` overloads | Do not replace them with a single Union-argument method; a macro generates the shared body |
| `patches/browser-port.patch`, provenance in `patches/README.md` | Provides Crystal 1.22 WASI/exception handling and LLVM integration | Keep the version pinned. Compare patches before updating, then retest exceptions, macros, and diagnostics |
| `scripts/prepare-browser-ir.cr` | LLVM 20 WASM exception-handling bugs: CFG Stackify fails in `pretty_print`, and `MainVisitor#visit(Yield)` produced invalid catch-target arity | Apply `optnone/noinline` only to affected functions, never generated user modules. Before removal, validate WASM and run the complete compiler tests in a real browser |
| `web/runtime/wasi-file-growth.js` | Avoids copying the entire file on every small append with shim 0.4.2 | Retain until upstream distinguishes capacity and logical length correctly. Test EOF, seek, stat, resize, and allocate |
| `src/wasm.cr` and `web/runtime/syntax-engine.js` | Exceptions in the lightweight 1.23 syntax engine trap rather than unwind | Save diagnostics before trapping and never reenter that instance, including to free it. This is separate from exception handling in the full compiler |
| `web/runtime/sha256.js` | `crypto.subtle` is unavailable on non-secure HTTP origins | Never skip SHA256 verification. Keep tests against native hashing and every distributed asset |

The file-growth workaround now covers reads and resizing as well. Previously, spare capacity could appear past EOF, and writes that grew a file within its allocated capacity could fail during copying. The adapter and regression tests contain this behavior without modifying upstream code.

## Verification and update procedure

Run tests with Node 24, which is also the CI major version:

```sh
npm ci --ignore-scripts  # Install pinned WASI host and lint/format tools
npm run web:deps         # Copy dependencies to the static site
npm run lint
npm run format:check
npm test                 # Also uses the real WASM compiler
```

For bundled recordings and dependency restoration:

```sh
make samples       # Compile and link nine examples with the browser WASM compiler
make test-sources  # Verify pinned archives, safe extraction, and overwrite protection
```

`export-samples.mjs` preserves labels from the manifest and regenerates source/recordings. Add a manifest label for each new example. `compiler-assets.mjs` shares asset loading with full-compiler tests and uses the same SHA256 verification as the browser. Recordings are replaced only after all examples succeed, except for the expected diagnostic in the type-error sample.

When changing Crystal code, rebuild the corresponding WASM: `make wasm` builds the lightweight syntax engine; `LLVM_CONFIG=llvm-config-20 make browser` builds the full compiler. Then run `make samples` and `make test`. The full build’s `crystal-host` is a build tool required to produce WASM and is not included in the distribution.

In a memory-constrained environment, do not build multiple Crystal compilers concurrently. Dependency and port-patch provenance is recorded in `THIRD_PARTY.md`. There is no need to reintroduce a removed npm package’s generic API into the application runtime.

Restored dependencies are not included in source ZIPs. Restore them with `make web-deps` and `make browser-deps`; see [DEPENDENCIES.md](DEPENDENCIES.md) for details.
