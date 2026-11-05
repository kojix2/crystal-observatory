#!/usr/bin/env python3
"""Limit LLVM 20 WASM-EH workarounds to affected compiler functions.

The upstream pretty_print exclusion prevents a CFG Stackify crash. In the
instrumented compiler, optimizing MainVisitor#visit(Yield) also produced invalid
catch target arity ("catch kind generates 1 operand, target block expects 0").
Keep that specialization unoptimized too, rather than disabling optimization
for the entire compiler. These attributes do not affect user-generated modules.
Remove exclusions only after rebuilding, validating WASM, and running npm test
plus a real-browser compilation; successful linking alone is insufficient.
"""
import pathlib
import re
import subprocess
import sys

opt, directory = sys.argv[1:]
out = pathlib.Path(directory)
proc = subprocess.Popen(
    [opt, '-S', str(out / 'observatory.bc'), '-o', '-'],
    stdout=subprocess.PIPE,
    text=True,
)
with (out / 'no-opt.csv').open('w') as attributes:
    for line in proc.stdout:
        if not line.startswith('define '):
            continue
        match = re.search('@"([^"]+)"', line)
        if not match:
            continue
        name = match[1]
        if 'pretty_print' in name or name == '*Crystal::MainVisitor#visit<Crystal::Yield>:Bool':
            attributes.write(f'{name},optnone\n{name},noinline\n')
raise SystemExit(proc.wait())
