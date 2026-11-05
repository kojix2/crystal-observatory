#!/usr/bin/env python3
"""Serve the portable GitHub Pages build on localhost."""
import argparse,http.server,pathlib
p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8000);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parent.parent/'web'
if not (root/'vendor/browser_wasi_shim/index.js').is_file():
    p.exit(1, 'Run npm ci --ignore-scripts and npm run web:deps before serving.\n')
handler=lambda *args,**kw:http.server.SimpleHTTPRequestHandler(*args,directory=str(root),**kw)
print(f'Open http://127.0.0.1:{a.port}/',flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1',a.port),handler).serve_forever()
