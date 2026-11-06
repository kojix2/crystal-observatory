# Browser compiler port patch

`browser-port.patch` contains the source changes made by
`build/crystal-wasm/apply-patches.py` from
[live-codes/browser-crystal](https://github.com/live-codes/browser-crystal/tree/daf9e56bfba0724e6fc689eff83f0e2415fab254/build/crystal-wasm)
at commit `daf9e56bfba0724e6fc689eff83f0e2415fab254`.
The integration is MIT-licensed; its copyright and license are preserved in
[`vendor/browser-crystal/LICENSE`](../vendor/browser-crystal/LICENSE). The
modified Crystal sources retain their upstream Apache-2.0 notices.

The diff targets the Crystal 1.22.0 archive in `deps/sources.lock.json`.

Provenance of the original patch generator:

- Archive URL: `https://codeload.github.com/live-codes/browser-crystal/zip/daf9e56bfba0724e6fc689eff83f0e2415fab254`
- Archive SHA256: `1a9a7723ecdbaa42362f2be0a84d23e13a107a3f46969ca4e44f04b6de7f8c7c`
- Generator SHA256: `7e86c54e250766415685fe351b06ce62b2c2d2d4a6a25293e4f33a600000c7b1`

When updating Crystal or the port, review the upstream changes and update this
diff and its provenance together. Keep `a/` and `b/` path labels for `patch -p1`.
Verify against a fresh source tree and follow the
[compiler verification procedure](../docs/MAINTENANCE.md).
