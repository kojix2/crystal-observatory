#!/usr/bin/env python3
"""Install the instrumented compiler and update its content receipt."""
import gzip, hashlib, json, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
data = gzip.compress(pathlib.Path(sys.argv[1]).read_bytes(), compresslevel=9, mtime=0)
target = root/'web/assets/compiler/compiler.wasm.gz'
target.write_bytes(data)
receipts = root/'web/runtime/asset-receipts.js'
values = json.loads(receipts.read_text().split('export const ASSET_RECEIPTS =', 1)[1].strip().removesuffix(';'))
values['compiler.wasm.gz'] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
receipts.write_text('// Pinned assets. compiler.wasm.gz is the Observatory instrumented build.\nexport const ASSET_RECEIPTS = '+json.dumps(values, indent=2)+';\n')
print(f'Installed browser compiler: {len(data):,} bytes gzipped')
