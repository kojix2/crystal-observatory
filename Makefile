.PHONY: deps web-deps syntax-deps browser-deps wasm browser samples serve test test-browser test-sources lint format-check

deps: web-deps
web-deps:
	npm ci --ignore-scripts
	npm run web:deps
syntax-deps:
	python3 scripts/fetch_sources.py syntax
browser-deps:
	python3 scripts/fetch_sources.py browser
wasm: syntax-deps
	bash scripts/build-wasm.sh
browser:
	bash scripts/build-browser.sh
samples:
	npm run samples
serve:
	python3 scripts/serve.py
test: test-sources test-browser
test-browser:
	npm test
test-sources:
	python3 -m unittest discover -s spec -p 'test_*.py'
lint:
	npm run lint
format-check:
	npm run format:check
