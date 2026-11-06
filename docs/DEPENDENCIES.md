# Git Management and Dependency Restoration

Keep the application and its pinned inputs in Git, but exclude restorable upstream source trees. npm packages and pinned source archives make the project reproducible from either a normal clone or a ZIP archive.

## What is tracked

| Item | Tracked in Git | Restored or generated at | Restore command |
|---|---|---|---|
| Application, tests, and documentation | Project-authored code in `src/`, `web/`, `spec/`, `scripts/`, and `docs/` | Same paths | Clone / ZIP |
| Crystal 1.23.0-dev (lightweight syntax WASM) | Commit and SHA256 in `deps/sources.lock.json` | `vendor/crystal-src/` | `make syntax-deps` |
| Crystal 1.22.0 (full compiler WASM) | Same lock file | `vendor/crystal-browser-src/` | `make browser-deps` |
| browser-crystal WASI port patch | `patches/browser-port.patch`, provenance in `patches/README.md` | Applied to `.cache/browser/src/` with `patch` | `make browser` |
| browser_wasi_shim 0.4.2 | `package.json`, `package-lock.json` | `node_modules/` → `web/vendor/browser_wasi_shim/` | `make web-deps` |
| Prism 1.30.0 (Crystal syntax highlighting) | `package.json`, `package-lock.json` | `node_modules/` → `web/vendor/prismjs/` | `make web-deps` |
| Observatory instrumentation and workarounds | `src/lab/`, `web/runtime/`, `scripts/prepare-browser-ir.sh` | Same paths | Versioned in Git |
| Distributed WASM, runtime assets, and compressed recordings | `web/syntax.wasm`, `web/assets/`, `web/traces/` | Same paths | Checked into Git |
| Licenses and provenance | `THIRD_PARTY.md` and notices under `vendor/` and `web/vendor/browser-crystal/` | Same paths | Checked into Git |

The lightweight syntax engine source is pinned to commit `25b1e80df925f4b7a003f7455d79a1eccc39874f`; the full compiler uses Crystal 1.22.0. Observatory instrumentation lives under `src/lab/` rather than modifying upstream source. The upstream WASI patch is applied to a working copy under `.cache/browser/src/`. LLVM 20 optimization exclusions are maintained in `prepare-browser-ir.sh`.

Each compiler entry passes its own version to the Recorder. The full compiler build restores Crystal 1.22.0 and applies the checked-in port patch; the syntax-engine build restores only the pinned 1.23.0-dev source.

## First-time setup

To run the web app (Node 24, npm, and Crystal; Ruby is an alternative static server):

```sh
make web-deps
make serve
# Or: ruby -run -e httpd web -p 8000 --bind-address=127.0.0.1
```

`make deps` is an alias for `make web-deps`. npm copies the WASI host and Prism components (`core`, `clike`, `ruby`, and `crystal`), along with their licenses, into the static site. Use `make serve PORT=8080` for another port. The app makes no CDN or npm requests after startup. Rebuilding Crystal or LLVM is unnecessary.

To rebuild the lightweight syntax WASM, install Crystal 1.22.0 and `wasm-ld`, then run `make wasm`. The source is restored automatically.

To rebuild the full browser compiler:

```sh
LLVM_CONFIG=llvm-config-20 make browser
make samples
make test
```

`make browser` restores pinned source, applies the port patch, builds and validates the WASM, and updates the distributed asset. It requires Crystal 1.22.0, LLVM 20, C++, Node 24, and supporting tools. The build-only compiler is placed at `.cache/browser/bin/crystal-host` and is not distributed. Web UI-only changes do not require this build.

## Starting a Git repository from a ZIP

Extract the ZIP into a new directory and run:

```sh
git init -b main
git add .
git status --short
git commit -m "Initial Crystal Observatory source"
```

`.gitignore` excludes fetched Crystal source trees and npm dependencies. Run `tokei` from inside the Git repository; `--no-ignore` also counts restored dependencies.

If dependencies were already added to Git, `.gitignore` alone does not untrack them. Review or back up local changes, then remove only the intended paths from the index. `--cached` leaves working files in place:

```sh
git rm -r --cached --ignore-unmatch vendor/crystal-src vendor/crystal-browser-src \
  web/vendor/browser_wasi_shim web/vendor/prismjs node_modules
```

The fetch scripts do not overwrite directories without a matching receipt or with a different locked version. Before reusing an existing destination, inspect local changes and move it aside if needed.

## Distributed assets and updates

WASM, runtime assets, and compressed recordings remain tracked so that a clone can run without heavyweight rebuilds. `asset-receipts.js` records the size and SHA256 of compiler assets. The Pages workflow prepares the WASI host from npm and deploys `web/`.

- Update the WASI host with `npm install --save-exact @bjorn3/browser_wasi_shim@<version>`, then update the lock file and tests. Do not edit the generated destination directly.
- When updating Crystal, update its revision, URL, SHA256, and prefix in `deps/sources.lock.json` together. Update the port diff and provenance in `patches/` when changing the port. Move existing restored sources aside, then fetch, patch, build, and test.
- Store custom patches in the project and apply them from preparation scripts; do not rely on manual edits to fetched files.
- Downloads are cached under `.cache/downloads/`. `crystal run scripts/fetch_sources.cr -- all --offline` verifies and reuses cached archives, and fails if an archive is missing.
- `make samples` runs the same browser WASM on Node and regenerates all nine recordings. It verifies successful linking except for the expected type-error example.

```sh
make test
crystal run scripts/package.cr -- dist/crystal-observatory-0.1.0.zip
```

Packaging excludes restored dependencies, caches, and build tools. Development targets Unix: `curl` downloads sources, `unzip` restores source archives, `cp -R -P` preserves source symlinks, `patch` applies the port, `awk` filters LLVM definitions, `gzip` compresses assets, `shasum -a 256 -c` verifies shell-build downloads, and `zip`/`unzip` create and verify source packages. These helper commands use Linux/macOS-compatible options, including `patch -f -N -F 0`; installing GNU coreutils on macOS is unnecessary. No Python runtime or shards are required. The complete compiler build is tested on Linux.

Source ZIP packaging passes the selected regular files directly to `zip` through a temporary parent symlink, giving entries the fixed `crystal-observatory/` prefix without copying the source tree first. Restored dependencies and source symlinks remain excluded. `prepare-browser-ir.sh` streams `opt` output through POSIX `awk`; Bash `pipefail` propagates tool failures before the build proceeds.

Source restoration uses `unzip -Z1` to list entries and `unzip -q` to extract selected files, both available with Linux and macOS Info-ZIP. The command restores symlinks and executable permissions without extending Crystal's ZIP reader. Paths and file/parent conflicts are checked before extraction into a temporary directory; escaping symlink targets are rejected before files are installed. SHA256 checks, offline caching and protection of existing source trees remain in place. `UNZIP`/`ZIPINFO` environment options are cleared for these commands so local defaults cannot change restoration behavior.
