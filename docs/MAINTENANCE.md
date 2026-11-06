# Maintenance

Document decisions, compatibility constraints and non-obvious failure modes.
Keep implementation details in code and tests, and change history in Git.
Avoid file inventories, duplicated constants and per-run validation reports.

## Changes and verification

Use Node 24 and the pinned dependencies. For ordinary changes:

```sh
make test
make lint format-check
```

Rebuild the corresponding WASM after changing compiler code or instrumentation:
`make wasm` for syntax analysis, `LLVM_CONFIG=llvm-config-20 make browser` for the
full compiler. Then regenerate recordings with `make samples` and run the checks
above. Add a manifest label when adding an example.

A successful link or tests against checked-in assets do not validate a compiler
rebuild. Validate the new WASM and compile in a real browser, including exceptions,
macros and diagnostics. Do not run concurrent compiler builds on a memory-limited
host. The complete build has been tested on Linux x86_64; macOS is unverified.

## Compatibility rules

- Reuse compiled WASM modules and immutable assets, but create a fresh WASM
  instance and compiler state for each analysis. Cancellation must discard stale
  results without invalidating reusable assets.
- Keep node selection independent of playback selection. Language changes and
  view switching must preserve both; do not reload a trace to redraw it.
- Store generated WASM with its source. A result must not overwrite newer editor
  text or execute automatically against different source.
- Preserve older schema-1 recordings. Missing coverage and declaration metadata
  mean unobserved, not an empty result. See [observation semantics](ARCHITECTURE.md).
- Preserve upstream behavior in hooks, record successful operations only after
  they succeed, and mute recording while serializing observations.

## Workarounds to revisit carefully

| Area | Constraint before changing it |
|---|---|
| `full_hooks.cr` type formatting and `set_type` overloads | An explicit `Crystal::Type#to_s : String` annotation caused compiler inference cycles. Keep the `Type`/`Nil` overloads distinct for `previous_def` dispatch; verify with a full WASM rebuild. |
| LLVM 20 WASM exception handling | Keep the narrow `optnone/noinline` exclusions in `prepare-browser-ir.sh` until a fresh build passes WASM validation and browser exception tests. Never apply them to user modules. |
| Lightweight syntax engine | Exceptions trap rather than unwind. Save diagnostics before the trap and never reenter that instance, including for cleanup. |
| WASI file growth adapter | Preserve logical EOF independently of allocated capacity. Check reads, seeks, resizing and allocation before replacing it with upstream code. |
| HTTP asset hashing | `crypto.subtle` is unavailable on some HTTP origins. Preserve the fallback and never skip integrity verification. |

Dependency and asset updates are covered in [DEPENDENCIES.md](DEPENDENCIES.md).
