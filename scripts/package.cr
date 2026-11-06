#!/usr/bin/env crystal
# Create a source ZIP with prebuilt WASM, excluding restored dependencies.
require "./support/package"

ObservatoryScripts.cli do
  args = ObservatoryScripts.arguments("Usage: package.cr OUTPUT.zip", 1)
  ObservatoryScripts::Package.create(Path[args[0]].expand)
end
