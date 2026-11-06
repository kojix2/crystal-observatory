#!/usr/bin/env bash
# Rebuild the instrumented browser compiler. Linux x86_64 is the tested host.
# Requires Crystal 1.22.0, LLVM 20 development files/tools, C++, patch, gzip, sha256sum, curl, Node 24 (WASM validation).
# Prebuilt browser assets are distributed; users do not need this to run the app.
set -euo pipefail
ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
CRYSTAL=${CRYSTAL:-crystal}
LLVM_CONFIG=${LLVM_CONFIG:-llvm-config-20}
export LLVM_CONFIG
[[ $("$LLVM_CONFIG" --version) == 20.* ]] || { echo 'LLVM 20 is required for the reproducible browser build' >&2; exit 1; }
"$CRYSTAL" --version | head -1 | grep -q '1.22.0' || { echo 'Use Crystal 1.22.0 to rebuild the browser compiler' >&2; exit 1; }
OUT=${BROWSER_BUILD_DIR:-"$ROOT/.cache/browser"}
mkdir -p "$OUT"
# Restore exact source revisions rather than borrowing the host installation.
"$CRYSTAL" run "$ROOT/scripts/fetch_sources.cr" -- browser
"$CRYSTAL" run "$ROOT/scripts/prepare-browser-source.cr" -- "$OUT"
# Keep helper scripts on the host standard library. Only compiler builds use
# the patched source tree and WebAssembly-specific LLVM settings.
mkdir -p "$OUT/bin"
${CXX:-c++} $("$LLVM_CONFIG" --cxxflags) -O2 -c "$OUT/src/llvm/ext/llvm_ext.cc" -o "$OUT/src/llvm/ext/llvm_ext.o"
env -u LLVM_VERSION -u LLVM_TARGETS -u LLVM_LDFLAGS CRYSTAL_PATH="$OUT/src" "$CRYSTAL" build "$ROOT/scripts/browser-bitcode-compiler.cr" \
  -Di_know_what_im_doing -Dwithout_playground -Dwithout_docs -Dwithout_interpreter -Dwithout_openssl \
  --no-debug -o "$OUT/bin/crystal-host"
env CRYSTAL_PATH="$OUT/src" LLVM_VERSION=20.1.8 LLVM_TARGETS=WebAssembly LLVM_LDFLAGS="" \
"$OUT/bin/crystal-host" build "$ROOT/src/browser_trace.cr" \
  -Dlab_full -Di_know_what_im_doing -Dwithout_playground -Dwithout_docs -Dwithout_interpreter \
  -Dwithout_openssl -Duse_pcre2 -Dwithout_mt --mattr=+exception-handling \
  --cross-compile --target wasm32-unknown-wasi --emit llvm-bc --single-module --no-debug -o "$OUT/observatory.bc"
LLVM_BIN=$("$LLVM_CONFIG" --bindir)
"$CRYSTAL" run "$ROOT/scripts/prepare-browser-ir.cr" -- "$LLVM_BIN/opt" "$OUT"
# LLVM 20 WASM-EH exclusions are documented in prepare-browser-ir.cr.
# Applied only when building the compiler itself.
# optnone requires noinline; this does not disable optimization in user modules.
"$LLVM_BIN/opt" -passes=forceattrs -forceattrs-csv-path="$OUT/no-opt.csv" "$OUT/observatory.bc" -o "$OUT/observatory.marked.bc"
"$LLVM_BIN/opt" -O3 "$OUT/observatory.marked.bc" -o "$OUT/observatory.opt.bc"
"$LLVM_BIN/llc" -march=wasm32 -mattr=+exception-handling -wasm-enable-eh -wasm-use-legacy-eh=false \
  -O3 -filetype=obj "$OUT/observatory.opt.bc" -o "$OUT/observatory.o.wasm"

fetch() {
  local url=$1 file=$2 digest=$3
  [[ -f "$file" ]] || curl -fL --retry 2 "$url" -o "$file"
  printf '%s  %s\n' "$digest" "$file" | sha256sum --check --status || {
    echo "Downloaded asset SHA256 mismatch: $file" >&2; return 1;
  }
}
LLVM_WASM=${LLVM_WASM:-"$OUT/llvm-wasm/package"}
if [[ ! -d "$LLVM_WASM/out/lib" ]]; then
  fetch 'https://registry.npmjs.org/@live-codes/llvm-wasm/-/llvm-wasm-0.1.0.tgz' "$OUT/llvm-wasm.tgz" e75ec5b39a1750faa2792a6671dc917b5ea321a857d822daa39e1436e0551d75
  mkdir -p "$OUT/llvm-wasm"
  tar --no-same-owner -xzf "$OUT/llvm-wasm.tgz" -C "$OUT/llvm-wasm"
fi
WASI_SDK=${WASI_SDK:-"$OUT/wasi-sdk-33.0-x86_64-linux"}
if [[ ! -x "$WASI_SDK/bin/clang" ]]; then
  [[ $(uname -sm) == 'Linux x86_64' ]] || { echo 'Set WASI_SDK to a wasi-sdk 33 installation for this platform' >&2; exit 1; }
  fetch 'https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-33/wasi-sdk-33.0-x86_64-linux.tar.gz' "$OUT/sdk.tar.gz" 0ba8b5bfaeb2adf3f29bab5841d76cf5318ab8e1642ea195f88baba1abd47bce
  tar --no-same-owner -xzf "$OUT/sdk.tar.gz" -C "$OUT"
fi
mkdir -p "$OUT/libLLVM"
for archive in "$LLVM_WASM"/out/lib/libLLVM*.a.gz; do
  gzip -dc -- "$archive" > "$OUT/libLLVM/$(basename -- "${archive%.gz}")"
done
gzip -dc -- "$ROOT/web/assets/compiler/lib/libpcre2-8.a.gz" > "$OUT/libpcre2-8.a"
COMPAT="$LLVM_WASM/wasi-compat"
"$WASI_SDK/bin/clang" --target=wasm32-wasip1 --sysroot="$WASI_SDK/share/wasi-sysroot" \
  -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_MMAN -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_PROCESS_CLOCKS \
  -I"$COMPAT/include" -include wasi-compat.h -O1 -c "$COMPAT/compat.c" -o "$OUT/compat.o"
"$WASI_SDK/bin/clang" --target=wasm32-wasip1 --sysroot="$WASI_SDK/share/wasi-sysroot" \
  -nostartfiles -fwasm-exceptions -Wl,-z,stack-size=33554432 -Wl,--max-memory=2147483648 -Wl,--strip-debug \
  "$OUT/observatory.o.wasm" "$OUT/compat.o" "$OUT"/libLLVM/libLLVM*.a \
  -L"$OUT" -lpcre2-8 -lc++ -lc++abi -lunwind -lwasi-emulated-signal -lwasi-emulated-mman \
  -lwasi-emulated-getpid -lwasi-emulated-process-clocks -o "$OUT/observatory.wasm"
# Link success does not guarantee valid WASM exception control flow. Validate
# before replacing the shipped asset and its receipt, then run npm test.
node --experimental-wasm-exnref --input-type=module - "$OUT/observatory.wasm" <<'JS'
import { readFile } from 'node:fs/promises';
await WebAssembly.compile(await readFile(process.argv[2]));
console.log('Browser compiler WASM validated');
JS
"$CRYSTAL" run "$ROOT/scripts/pack-browser.cr" -- "$OUT/observatory.wasm"
