# Browser compiler port patch

`browser-port.patch` contains the source changes made by
`build/crystal-wasm/apply-patches.py` from
[live-codes/browser-crystal](https://github.com/live-codes/browser-crystal/tree/daf9e56bfba0724e6fc689eff83f0e2415fab254/build/crystal-wasm)
at commit `daf9e56bfba0724e6fc689eff83f0e2415fab254`.
The integration is MIT-licensed; its copyright and license are preserved in
[`vendor/browser-crystal/LICENSE`](../vendor/browser-crystal/LICENSE). The
modified Crystal sources retain their upstream Apache-2.0 notices.

The diff was generated against the exact Crystal 1.22.0 source archive recorded
in `deps/sources.lock.json`. Applying it and then the Observatory instrumentation
produced a tree identical to the previous Python preparation pipeline, including
symlinks. Python is not needed to restore, patch, build, serve, test or package
the project.

Provenance of the original patch generator:

- Archive URL: `https://codeload.github.com/live-codes/browser-crystal/zip/daf9e56bfba0724e6fc689eff83f0e2415fab254`
- Archive SHA256: `1a9a7723ecdbaa42362f2be0a84d23e13a107a3f46969ca4e44f04b6de7f8c7c`
- Generator SHA256: `7e86c54e250766415685fe351b06ce62b2c2d2d4a6a25293e4f33a600000c7b1`

`scripts/prepare-browser-source.cr` copies restored source into a temporary build
tree and runs `patch -f -N -F 0 -p1`. Its receipt fingerprints
the checked-in diff, instrumentation and preparation code. Unknown or stale
build trees are rejected rather than patched again. A failed preparation is
discarded without publishing a partial tree.

When updating Crystal or the port, review the upstream changes and update this
diff and its provenance together. Generate unified diffs with `a/` and `b/` path
labels and no timestamps (`diff -u -L a/path -L b/path old new`).
Verify that the fresh patched tree matches the intended upstream port before
rebuilding, validating WASM and running the compiler tests.
