#!/usr/bin/env crystal
# Install the instrumented compiler and update its content receipt.
require "./support/pack_browser"

ObservatoryScripts.cli do
  args = ObservatoryScripts.arguments("Usage: pack-browser.cr COMPILER.wasm", 1)
  ObservatoryScripts::CompilerAsset.install(Path[args[0]])
end
