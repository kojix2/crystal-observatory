# Validation Record

## Crystal development scripts — 2026-11-06

All eight Python scripts and their source-restoration/instrumentation tests were
migrated to Crystal. The upstream browser port is now a checked-in unified diff
applied by `patch`; shell build steps use `sha256sum` and `gzip`.

Validated on Linux with Crystal 1.22.2 and Node 23.11.0 (CI continues to use
Crystal 1.22.0 and Node 24):

- 18 Crystal specs passed, covering source hashes, safe ZIP extraction, symlinks
  and executable modes, offline/cache behavior, failed-download cleanup,
  instrumentation, build receipts, LLVM output streaming and exit status,
  deterministic gzip receipts, and source packaging.
- Fresh Crystal-restored pinned sources matched the previous Python-restored
  tree. The new patch and instrumentation pipeline also produced a tree identical
  to the previous pipeline, including symlinks, using `diff -r --no-dereference`.
- Existing Node tests passed across all 14 test files, including real WASM
  compilation and execution. ESLint and Prettier passed.
- The Crystal HTTP server returned the actual `index.html` at `/` and served
  WASM, JavaScript and gzip with their expected content types on localhost.
- A real source ZIP was generated and verified with `unzip -t`; it included the
  Crystal scripts and checked-in patch and excluded restored dependencies.
- The LLVM exclusion script was checked against actual LLVM 20 output and a
  failing child process. Shell syntax, Crystal formatting and whitespace checks
  passed.

The complete compiler WASM was not rebuilt for this migration; its prepared
source is unchanged and the distributed assets passed the existing tests. The
records below describe earlier validations, including the former Python tests.

## Visitor activity validation — 2026-11-05

The latest change adds actual activity observations for all fifteen recorded
Visitor/Transformer identities, including the nested well-known-functions
selector. This is representative coverage, not a claim that every internal
operation is instrumented; see [ACTIVITIES.md](ACTIVITIES.md).

| Check | Result |
|---|---|
| `make samples` | All 14 recordings regenerated; 13 linked and one retained its expected type diagnostic; none truncated |
| `make test` | 62 Node tests and 8 Python tests passed |
| `npm run lint` | Passed |
| `npm run format:check` | Passed |
| Compiler asset | Rebuilt through the existing build host and LLVM 20 O3 pipeline; `WebAssembly.compile`, integrity checks, linking and execution passed |
| Coverage/source agreement | All recorded coverage entries exactly match the source declaration; checked by regression test |
| Old recordings | All nine original HEAD recordings validated and replayed forwards/backwards without conversion |
| Chromium | All fifteen activity identities displayed with corresponding node/history links; no page exceptions |

Final recording sizes:

| Example | Events | Nodes |
|---|---:|---:|
| 01_specialization | 345 | 27 |
| 02_union_and_narrowing | 455 | 29 |
| 03_macro_expansion | 322 | 23 |
| 04_normalization | 691 | 47 |
| 05_overloads | 523 | 47 |
| 06_cleanup | 195 | 10 |
| 07_struct | 1307 | 115 |
| 08_type_error | 135 | 10 |
| 09_declarations | 1496 | 101 |
| 10_initializers | 12689 | 1724 |
| 11_restrictions | 1471 | 122 |
| 12_guess_and_self | 1516 | 134 |
| 13_missing_types | 731 | 65 |
| 14_macro_control | 592 | 49 |

Additional verification:

- Tests assert real restriction additions and conditional/reassigned-argument
  skips, initializer replacement/casting/deferral, merged guesses, self detection
  and self.class exclusion, macro branches/iterations/source, missing block types
  and dead-code observations. Error-path tests preserve diagnostics without
  producing a success event or executable.
- The five new examples were compiled and executed by the browser WASM pipeline.
  Their outputs were respectively `20`, `9`, `1 / 2.5`,
  `7 / Proc(Int32, NoReturn) / 5`, and `2 / 5 / 8`.
- Chromium checks covered every Visitor's measured activity, helper context,
  distinct selector role, source-formatting warning, LLVM function navigation,
  evidence-node selection and history navigation without replacing that node.
- Activity-subtype filters produced matching collapsed summaries; switching all
  seven locales preserved filter value and playback position. Importing an old
  trace showed uninstrumented status and no invented activity rows.
- Types history links and AST markers worked in Chromium. A grid-row shift caused
  by the additional activity toolbar was found and fixed; at 1600×1000 the History
  table retained more than 300 px of usable height and group buttons were clickable.
- Live compilation and execution of example 11 in Chromium produced `9`.

Build limitation: attempts to repeat the complete `make browser` target, including
host regeneration, and some later LLVM object-generation retries were terminated
with exit code 143 in this environment. A clean full rebuild is therefore not
claimed as passing here. The distributed asset is the successful O3 build from
the existing host, not an output from the interrupted retries or experimental
lower-optimization commands. Its coverage declarations match the retained source,
and the complete tests and browser checks above use that distributed asset.

The earlier declaration-only validation record follows for historical context.

Validated declaration instrumentation, replay at each event, and integration with the Declarations and type-hierarchy UI on 2026-11-05. Rebuilt the full compiler WASM and regenerated all nine recordings. The existing lightweight syntax WASM was retained.

## Environment and scope

- Linux x86_64, Node 24.22.2, Python 3
- Full engine: Crystal 1.22.0 with browser-crystal WASI/EH patches, LLVM 20.1.8, and LLD
- Lightweight syntax engine: pinned Crystal 1.23.0-dev source
- Shared WASI host: browser_wasi_shim 0.4.2 from the npm lock file

Node tests invoke the same WASM binaries, WASI host, and compilation pipeline as the browser. They do not imitate Crystal behavior in JavaScript.

## Results

| Area | Result |
|---|---|
| Full compiler WASM | Rebuilt with instrumentation; WASM validation, execution, and hash verification passed |
| Lightweight syntax WASM | Existing syntax tests passed |
| Bundled recordings | All nine regenerated with the new compiler and passed integrity checks |
| Node tests | 55 passed |
| Python tests | 6 passed: 4 dependency-restoration tests and 2 declaration-instrumentation tests |
| ESLint / Prettier | Passed |
| Chrome UI and WASM execution | The operations listed below were checked |
| Declaration UI | Chromium checks covered type selection, playback, source/AST navigation, filters, locale switching, old traces, live compilation, method redefinition, and hook-generated AST |

The full compiler build was also tested from restored Crystal 1.22.0 sources and port patches without syntax-engine sources, confirming that it does not depend on them. The 1.23.0-dev syntax sources were restored afterward.

Regenerated recordings:

| Example | Events | Nodes | Result |
|---|---:|---:|---|
| 01_specialization | 307 | 27 | Linked |
| 02_union_and_narrowing | 411 | 29 | Linked |
| 03_macro_expansion | 295 | 23 | Linked |
| 04_normalization | 620 | 47 | Linked |
| 05_overloads | 466 | 47 | Linked |
| 06_cleanup | 184 | 10 | Linked |
| 07_struct | 1180 | 108 | Linked |
| 08_type_error | 125 | 10 | Type diagnostic |
| 09_declarations | 1348 | 101 | Linked |

## Test coverage

| Area | Verification |
|---|---|
| Arbitrary source through execution | Observed semantic analysis → LLVM → WASM object → LLD → stdout |
| Language features | Type-specialized methods, macros, collections, Unicode, regex, stdin, and ARGV |
| Exceptions and recovery | `rescue`/`ensure`; recompilation after syntax and type errors |
| File behavior | In-memory file reads, EOF, seek, stat, resize, and allocate |
| Trace and replay | Reference integrity across nine recordings, balanced Visitor entry/exit, rewind of types, dependency edges and declaration state, expansions, and overloads |
| Declaration operations | Identity across creation and reopening, namespaces, generic types and structs, inheritance, include/extend, method replacement and rewind, macro hooks, failed operations, and older traces |
| Syntax engine | Unicode, interpolation, macros, syntax diagnostics, and no reentry after a trap |
| Async UI behavior | Worker cancellation, deadlines, failure recovery, and invalidation of stale results |
| Display settings | Three-column layout, stacked-details ratio, migration from old settings, JA/EN keys and placeholders, and English default |
| Highlighting and explanations | Shipped Crystal grammar, macros/interpolation/annotations/incomplete input, text preservation, HTML escaping, and separation of Visitor role from operation |
| Asset integrity | Shipped asset SHA256 checks and HTTP hash fallback boundary cases |
| Dependency restoration | Pinned archive hashes, internal symlinks, safe extraction, and protection against overwriting existing sources |

`make samples` runs the actual browser WASM under Node. Eight examples must link successfully; the type-error example must produce the expected diagnostic and no executable. Compressed recordings are updated only after all examples have been checked.

## Commands

```sh
make web-deps
make samples
make test
npm run lint
npm run format:check
```

For changes to the full compiler’s Crystal code, rebuild its distributed WASM with `LLVM_CONFIG=llvm-config-20 make browser`. For changes to lightweight syntax-engine behavior, also run `make wasm`. The schema additions in this change are optional and unused by the syntax engine, so its WASM was not rebuilt. The full compiler build validates the linked WASM with `WebAssembly.compile` before updating the asset and its receipt.

## Browser checks

Additional checks for this change:

- Selected declaration operations in example 09 and inspected type registration/reopening, inheritance/includes, method lists, and macro call context. Rewinding removed later registrations.
- Verified that manually selecting types or source/AST did not change the selected operation, that declaration filtering exposed operation rows directly, and that older traces showed declarations as unobserved. Compiled and ran example 09, checking `instance`, `class`, `7`, `8`, `nine`, and `42`.
- Verified same-signature method replacement and rewind; navigation to macro- and include-hook-generated AST; and preservation of the snapshot and selected event.

Previously recorded browser checks:

- English initial display. Switching JA/EN preserved source and history position; locale and divider settings persisted after reload.
- A one-row 40 px header; History on the left; Source/AST in the center; node details at upper right; Visitor/operation details at lower right.
- Initial source selection and bundled sample display. Editing switched the sample label to “Custom code.”
- Edited more than 65 lines of syntax-colored Japanese and interpolated source. Verified vertical/horizontal scroll synchronization and matching textarea/highlight text and line dimensions.
- Selected a Normalizer rewrite and inspected the change from `x += 2` to `x = x + 2`; selecting another AST node did not replace the operation explanation.
- Divider keyboard controls and reset, History collapse, observation-pane maximize, and tab arrow-key navigation.
- Compiled and ran edited macro, Unicode, and collection code; checked `結晶 46` and `1,9,16`.
- Compiled another input to LLVM IR without running it, then used Output’s Run again and checked `結晶 42`.
- Used Parse only on incomplete `def broken(` and observed the actual EOF diagnostic; a subsequent valid input recovered and produced an AST.

## Limitations

WASM execution and the JavaScript model were tested under Node, and the UI and interactions were checked in Chrome. GitHub Actions execution and deployment were not performed. Japanese text preservation was checked, but IME behavior on every OS and all assistive technologies were not exhaustively tested.

This does not imply that every Crystal spec passes or that every browser or external library is supported. Input must conform to WASI; OS processes, sockets, and external C libraries are unavailable. Generated programs have no GC. Input, time, memory, and output limits are described in [ARCHITECTURE.md](ARCHITECTURE.md).
