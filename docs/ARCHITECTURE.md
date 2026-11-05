# Observation Design and In-Browser Compilation

## 1. Separating the UI from the compiler

Each analysis creates a fresh Program, type system, AST, and LLVM Context. Heavy work runs in a compiler Worker so the UI remains responsive. After compilation, the app may reuse the compiled `WebAssembly.Module` and assets, but never the previous WASM instance or its input files.

Generated programs run in a separate execution Worker. Syntax-only and execution Workers are disposable; cancellation or timeout terminates the relevant Worker. `WorkSession` coordinates operations so that an older result cannot replace the result of a newer request.

## 2. ASTs are more than trees

In the initial syntax tree, a `Def` declaration and a `Call` are separate nodes. After semantic analysis, a Call can have `target_defs` linking to methods specialized for particular types. Expandable nodes can also retain an `expanded` node.

Snapshots distinguish these edge types:

| Edge | Meaning |
|---|---|
| `children` | Syntactic children enumerated by `accept_children` |
| `expanded` | Expansion result retained by the compiler |
| `hook_expansions` | Macro-hook expansions retained by declarations, includes, and related nodes |
| `targets` | Typed methods targeted by a call |

IDs and a visited set prevent infinite traversal of shared nodes or cycles. Node IDs are stable only within one recording; they do not correspond across compilations. The Recorder retains the original objects to prevent object-ID reuse after garbage collection.

Standard-library `FileNode`s are excluded from the graph. A directly referenced type dependency or call target may be recorded as a boundary node when needed. This avoids expanding the entire standard library and obscuring the user code.

## 3. What “measured Visitor behavior” means

Events record actual entries into `ASTNode#accept`. The original `Visitor#visit_any`, type-specific `visit`, `accept_children`, and `end_visit` behavior is preserved through `previous_def`; the tool does not invent a traversal order.

Not every compiler operation is a Visitor. Helper type lookups and code paths that call `visit` directly without going through `accept` are not fully observed. Individual return values from `visit_any` and `visit` are not recorded either. The UI presents observed nesting and side effects such as type changes, dependencies, and expansions.

`SyntaxWalkVisitor` is an Observatory-defined Visitor for displaying syntax trees. Unlike MainVisitor and Normalizer, it is not part of the compiler’s semantic-analysis pipeline. The UI displays it in a separate mode.

### Declaration operations are observed separately from visits

`scripts/instrument_declarations.py` inserts hooks at successful mutation points in the pinned TopLevelVisitor source: type creation/reopening, inheritance, include/extend, and explicit `Def` registration. It modifies neither the fetched upstream sources nor the compiler source checkout; it applies to the generated build tree after the port patch. Each source replacement checks that its expected fragment occurs exactly once, and the script hash is included in the build-tree fingerprint. If later work fails after a mutation has succeeded, the completed mutation remains recorded; a failed registration is not reported as successful.

Class registration and superclass information are emitted consecutively after registration succeeds. The trace records observed declarations and relationships, not every internal assignment. Method signatures come from the AST at registration time; they do not necessarily reproduce the original unnormalized source header or restrictions added later.

The optional `declarations_version: 1` extension to schema 1 adds `semantic_types`, `definitions`, and `declaration` events. Semantic type IDs are distinct from AST node IDs and remain stable across reopenings of the same type. Method definitions retain their Def identity and owner and distinguish instance-side from class-side methods. Names and signatures are for display, not identity. Declaration operations are not inferred from AST `type?` or `resolved_type`.

`TraceModel` applies declaration events to reconstruct types, relationships, and methods up to the selected event. For method redefinitions, it records the replacement returned by the compiler and replaces only that definition, preserving other overloads and class-side methods. It does not infer replacements when the trace has no such information. Types in the static catalog are not shown until an event references them. Backward seeking resets and replays the model. The Declarations view is separate from the AST type-dependency graph and links types and registrations to source, AST, and history. Manual type or node selection remains independent from playback-event selection. If generated AST is absent from the current snapshot, the AST link selects a snapshot containing it without changing the playback event.

This is not a complete symbol table. It focuses on user-source class, struct, and module declarations and explicit method registrations; relationship references can include standard-library boundary types. Generated `new` methods, constants, aliases, enums, FFI details, and annotation details are out of scope. Macro-generated nodes use existing source-location mapping and, when available, link to an observed call context. The trace does not reconstruct complete causality for macro hooks. Older and syntax-only traces with no observations are distinguished from new traces before their first declaration and from truncated recordings.

The build-only host compiler entrypoint is `scripts/browser-bitcode-compiler.cr`. It allows only `--emit llvm-bc` and skips an unused object that upstream cross-compilation would otherwise emit. The bitcode continues through the existing `opt` and `llc` pipeline. This affects only the build host, not code generation by the in-browser compiler.

## 4. Type inference follows a dependency graph

`ASTNode#add_observer` registers a node that depends on another node’s type. In an event, `node_id` is the observer and `related_id` is the dependency. Type changes can trigger recalculation through these dependencies and may cause a Call to resolve its targets again.

The tool records `set_type` and observer additions/removals along these implementation paths. Direct writes to instance variables are not necessarily observed as type changes. Snapshots also store actual `type?` values at their capture time. Manually selecting a stage displays snapshot types; following events displays recorded type changes.

## 5. Relating AST nodes to LLVM IR

At the end of each CodeGenVisitor visit, the Recorder captures the Builder insertion block, its parent function, and up to the last six instructions in the block. The generated module is then verified by LLVM’s verifier, and the complete IR is saved.

This does not mean “one AST node produces one instruction.” A parent’s record includes instructions emitted by its children, and control flow can change the Builder’s insertion point. Use the records to navigate functions and inspect IR. LLVM optimization passes, instruction selection, and internal LLD activity are not recorded. The browser build does generate, link, and run a real WASM object.

## 6. Trace limits and replay

- Source input: 256 KiB
- Events: 40,000
- Retained AST objects: 8,000
- Web syntax Worker: 15 seconds
- Imported trace: 50 MiB after decompression

The compiler continues if the event limit is reached. The bundle records `truncated: true`, and the UI indicates that history is incomplete. These limits are not a complete memory sandbox.

ASTs are captured at stage boundaries, expansions, and call resolution. Since changes between events are not stored as reversible AST diffs, the UI does not claim to reconstruct the complete AST at every arbitrary event.

## 7. The complete compiler in the browser

`src/browser_trace.cr` and the shared `src/lab/compilation.cr` are built as WASM and linked with LLVM 20.1.8 for WASI. They invoke the actual `Crystal::Compiler` and `Program#codegen`, while observation hooks in `src/lab/` produce JSON. IR serialization, verification, and WASM object generation operate on the same LLVM module.

`web/runtime/compiler-pipeline.js` invokes the compiler and LLD as separate WASM commands. `main.cr`, the standard library, output object, and trace live in WASI’s in-memory filesystem. No OS process or server API is used. Generated programs run in yet another Worker. The UI supplies stdin and arguments and displays program output.

The port is based on `live-codes/browser-crystal` 0.4.0 (commit `daf9e56bfba0724e6fc689eff83f0e2415fab254`) and `@live-codes/llvm-wasm` 0.1.0. The Crystal 1.22.0 patch connects WASM exception handling to LLVM funclet/catchpad constructs, libunwind, and libc++abi. The build also needs `-wasm-enable-eh` and `-wasm-use-legacy-eh=false`. This supports exceptions inside the compiler and `rescue`/`ensure` in generated programs.

The build script is `scripts/build-browser.sh`. It first builds a patched host compiler, which emits bitcode for the observation engine. LLVM 20 `opt` and `llc` optimize and produce WASM code, which is linked with WASI libLLVM. To work around LLVM 20 WASM exception-handling issues, the build excludes `pretty_print` from optimization and applies `optnone/noinline` to `MainVisitor#visit(Yield)`, which otherwise produced invalid catch control flow in the instrumented build. The linked binary is checked with `WebAssembly.compile` before the distributed asset and receipt are updated. These adjustments apply only to the compiler build.

On first load, compressed assets are checked against their recorded lengths and SHA256 hashes. Each analysis uses a fresh instance; compiler Programs and LLVM Contexts are not reused. Only the `WebAssembly.Module` is cached in the Worker. Compilation has a 120-second deadline. Program execution has a 10-second deadline, 256 MiB memory limit, and 256 KiB output limit.

WASI constraints remain: macros using `run` or `system` to launch native processes, external C libraries, OS threads, and sockets do not work like they do in desktop Crystal. The full compiler and bundled recordings use Crystal 1.22.0. The lightweight syntax engine uses Crystal 1.23.0-dev; each trace records its actual compiler version.

The lightweight **Parse only** mode uses the existing `syntax.wasm`. Its Crystal 1.23.0-dev runtime traps on exceptions, so an adapter saves syntax diagnostics to JSON before the trap. The full compiler does not use this workaround.

## 8. Source map

Responsibilities, Worker lifetimes, retained workarounds and their removal criteria, and test entrypoints are described in [MAINTENANCE.md](MAINTENANCE.md).

- `src/lab/`: WASM compiler entrypoint, shared observation model, and hooks.
- `web/core/`: DOM-independent trace model and input processing.
- `web/runtime/`: Worker management, WASI, compilation, and linking.
- `web/workers/`: Worker message entrypoints.
- `web/ui/`: User interaction and rendering; `web/app.js` only wires components together.
- `web/assets/compiler/`: Built compiler assets.
- `web/vendor/`: Unmodified WASI host and Prism components prepared from npm, with upstream licenses.

Important JSON keys include `nodes`, `events`, `snapshots`, `tokens`, and `llvm_ir`. Event `index` values are zero-based; the UI playback position is one-based. `snapshots[].at_event` is the number of events already recorded immediately before the snapshot was taken.

## 9. Separate display and selection state

History is on the left, observation tabs are in the center, and details are on the right. Initial code is selected in the Source tab; compile, run, and syntax-analysis commands are in the header. Opening and saving traces are in History. The former stage tabs were removed; inspect stages through history, the next-stage control, and AST snapshots.

The upper details pane follows the selected node, while the lower Visitor/operation pane follows the history event. Selecting a different AST or stack node does not replace the operation explanation. General Visitor roles are described separately from measured values such as type changes, expansions, and call resolution. Hook notifications are not presented as Visitor visits.

The native textarea handles editing, with Prism syntax colors overlaid in a non-interactive `pre` behind it. Font metrics, line height, and padding match, and scrolling is synchronized. This preserves native IME, selection, and copy behavior. If highlighting fails, escaped plain text remains visible. In forced-colors mode the textarea itself is displayed. Highlighting is not semantic analysis and may be inaccurate for incomplete input or unsupported syntax.

The three-column proportions and stacked-details ratio are stored as `workspace.v3`. Settings from the old four-column layout are not reused because the columns had different meanings. Dividers support dragging, arrow keys, and Home to reset.
