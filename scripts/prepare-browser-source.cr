#!/usr/bin/env crystal
require "./support/prepare_browser_source"

ObservatoryScripts.cli do
  args = ObservatoryScripts.arguments("Usage: prepare-browser-source.cr OUTPUT", 1)
  puts ObservatoryScripts::BrowserSource.prepare(Path[args[0]].expand)
end
