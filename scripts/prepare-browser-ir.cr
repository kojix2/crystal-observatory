#!/usr/bin/env crystal
# Limit LLVM 20 WASM-EH workarounds to affected compiler functions.
# pretty_print avoids a CFG Stackify crash. MainVisitor#visit(Yield) avoids
# invalid catch target arity in the instrumented compiler. These attributes
# apply only to the compiler itself, not to user-generated modules.
# Remove exclusions only after rebuilding, validating WASM, running npm test,
# and compiling in a real browser; successful linking alone is insufficient.
require "./support/browser_ir"

ObservatoryScripts.cli do
  opt, directory = ObservatoryScripts.arguments("Usage: prepare-browser-ir.cr OPT DIRECTORY", 2)
  status = ObservatoryScripts::BrowserIR.prepare(opt, Path[directory])
  exit status.exit_code
end
