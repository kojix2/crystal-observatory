#!/usr/bin/env bash
# Limit LLVM 20 WASM-EH workarounds to affected compiler functions.
# pretty_print avoids a CFG Stackify crash. MainVisitor#visit(Yield) avoids
# invalid catch target arity in the instrumented compiler. These attributes
# apply only to the compiler itself, not to user-generated modules.
# Remove exclusions only after rebuilding, validating WASM, running npm test,
# and compiling in a real browser; successful linking alone is insufficient.
set -euo pipefail
[[ $# == 2 ]] || { echo 'Usage: prepare-browser-ir.sh OPT DIRECTORY' >&2; exit 1; }
"$1" -S "$2/observatory.bc" -o - | awk '
  /^define / && match($0, /@"[^"]+"/) {
    name = substr($0, RSTART + 2, RLENGTH - 3)
    if (index(name, "pretty_print") || name == "*Crystal::MainVisitor#visit<Crystal::Yield>:Bool") {
      print name ",optnone"
      print name ",noinline"
    }
  }
' > "$2/no-opt.csv"
