# Dependency updates

Keep source pins in `deps/sources.lock.json` and npm pins in `package-lock.json`.
Restored trees and toolchains are disposable; prebuilt WASM, asset receipts and
compressed recordings stay in Git so the app runs without rebuilding compilers.
Preserve upstream licenses and notices when replacing any dependency or asset.

When updating Crystal, update the revision, archive URL, SHA256 and prefix together.
Review the browser port diff and its [provenance](../patches/README.md) against the
new sources. Rebuild and verify as described in [MAINTENANCE.md](MAINTENANCE.md).

Source restoration does not overwrite unknown or differently pinned trees, and
preparation rejects stale build receipts. Inspect local edits before moving a
tree aside; use a fresh `BROWSER_BUILD_DIR` for new build inputs. Do not bypass
these checks or patch the restored checkout manually.

When replacing compiler assets, update their receipts and regenerate recordings
from that same compiler. Tests against older checked-in assets do not verify the
replacement. Keep generated npm dependencies unmodified; maintain local runtime
adaptations separately.
