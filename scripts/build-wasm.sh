#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
CRYSTAL=${CRYSTAL:-crystal}
[[ -f vendor/crystal-src/compiler/requires.cr ]] || { echo 'Run make syntax-deps first.' >&2; exit 1; }
CACHE="$ROOT/.cache/wasm"
export WASI_SYSROOT=${WASI_SYSROOT:-"$CACHE/wasm32-wasi-sysroot"}
if [[ ! -d "$WASI_SYSROOT" ]]; then
  mkdir -p "$CACHE"
  curl -fL --retry 2 https://github.com/kojix2/wasm-libs/releases/download/v0.0.5/wasm32-wasi-sysroot.tar.gz -o "$CACHE/sysroot.tar.gz"
  python3 - "$CACHE/sysroot.tar.gz" <<'PY'
import hashlib,sys
with open(sys.argv[1],'rb') as f:actual=hashlib.file_digest(f,'sha256').hexdigest()
expected='8b123e2b7103e330c7d1743649aa0738b5ec05023a48ba609205bced7f9f2eb8'
if actual != expected:raise SystemExit('WASI sysroot SHA256 mismatch')
PY
  tar --no-same-owner -xzf "$CACHE/sysroot.tar.gz" -C "$CACHE"
fi
export CRYSTAL_PATH="$ROOT/vendor/crystal-src"
export CRYSTAL_LIBRARY_PATH="$WASI_SYSROOT/lib/wasm32-wasi"
# The supplied 1.23.0-dev WASI EventLoop implements the single-thread interface.
"$CRYSTAL" build src/wasm.cr --target wasm32-wasi -Dwithout_mt --release --no-debug -o web/syntax.wasm
