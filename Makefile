CRYSTAL ?= crystal
PORT ?= 8000

.PHONY: deps web-deps syntax-deps browser-deps wasm browser samples serve test test-browser test-sources lint format-check

deps: web-deps
web-deps:
	npm ci --ignore-scripts
	npm run web:deps
syntax-deps:
	$(CRYSTAL) run scripts/fetch_sources.cr -- syntax
browser-deps:
	$(CRYSTAL) run scripts/fetch_sources.cr -- browser
wasm: syntax-deps
	bash scripts/build-wasm.sh
browser:
	bash scripts/build-browser.sh
samples:
	npm run samples
serve:
	$(CRYSTAL) run scripts/serve.cr -- --port $(PORT)
test: test-sources test-browser
test-browser:
	npm test
test-sources:
	$(CRYSTAL) spec spec/*_spec.cr
lint:
	npm run lint
format-check:
	npm run format:check
