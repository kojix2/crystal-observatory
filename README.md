# Crystal Observatory

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/2e0ee49e-7379-44a9-9201-d7e7f8ff58ec" />

:warning: This project is a prototype created using code generation by Codex.

A browser app for compiling Crystal source, observing the compiler's Visitors and type inference, generating LLVM IR, linking WebAssembly, and running it locally.

[User guide](USER_GUIDE.md)

- Actual **Crystal 1.22.0 + WASI/EH patches, LLVM 20.1.8 and LLD** run inside Web Workers. Source code stays in your browser.
- History on the left; Source, AST, types, declarations, tokens, IR and output tabs in the center; node details above visitor/operation details on the right. Resize column widths and the stacked details.
- Crystal syntax highlighting while editing and in node/rewrite details. English by default, with a persistent JA/EN switch.
- Observe Visitor entry/exit, declaration registration, transformations, type dependencies, macro expansion, specialized methods, and LLVM insertion points. Export/import trace JSON.
- Nine examples and recordings produced by the same WASM compiler. A separate lightweight Crystal 1.23.0-dev syntax engine handles Lexer/Parser-only inspection.

## Run locally

Node 24 and npm prepare the static WASI host. `make serve` uses Crystal to serve files; no LLVM installation or compiler rebuild is needed. Ruby can also serve the prebuilt app without installing Crystal.

```sh
npm ci --ignore-scripts
npm run web:deps
make serve
# Alternatively: ruby -run -e httpd web -p 8000 --bind-address=127.0.0.1
```

Open <http://127.0.0.1:8000/> in a browser with standardized WebAssembly exception handling. If Ruby lacks WEBrick, install it with `gem install webrick`. Use `make serve PORT=8080` to change the port. Use HTTP rather than opening the HTML file directly.

Choose initial code in the **Source** tab, or edit freely. **Compile & run** compiles and executes; **Compile → IR** compiles and links without execution; **Parse only** uses the lightweight syntax engine. The **Output** tab accepts stdin and a JSON array of arguments.

**Open trace…** and **Save trace JSON** manage recordings in History. **Example trace** in Source opens the selected example's bundled recording; compilation always analyzes the current editor contents. Select a history event to inspect its visitor's role, measured operation, before/after values and visit stack. Selecting a different AST node changes the upper details without replacing the selected event's explanation below.

Example **09** uses **Declarations** and **Next declaration** to link observed registration state to source, AST and history. Rewinding restores earlier state. This is not a complete symbol table; older and parse-only traces report declarations as unobserved.

Programs target WASI: host processes, sockets, host files and arbitrary C libraries are unavailable. Generated programs have no GC, and run in a separate Worker with a 10-second deadline, 256 MiB memory limit and 256 KiB output limit. Compilation has a 120-second deadline. Full limits and observation boundaries are in [the architecture guide](docs/ARCHITECTURE.md).

## Develop and verify

Development uses Unix, Crystal, Node 24 and npm. Source restoration uses `curl`; browser source preparation uses `cp` and `patch`; builds use `gzip`, `sha256sum` and `tar`; source packaging uses `zip` and `unzip`. The supplied build scripts are tested on Linux.

```sh
make web-deps
make samples       # Regenerate recordings with the actual WASM compiler
make test          # Crystal source-restoration tests + Node WASM/UI-model tests
npm run lint
npm run format:check
```

The same verified compiler assets and JavaScript pipeline power browser compilation, recordings and integration tests. The CI checks these and rebuilds the lightweight syntax WASM.

To rebuild WASM, install Crystal 1.22.0 and the toolchain described in the [user guide](USER_GUIDE.md):

```sh
make wasm          # Syntax engine; requires wasm-ld on PATH
LLVM_CONFIG=llvm-config-20 make browser  # Complete compiler; larger build
make samples
make test
```

Source archives are pinned by revision and SHA256 in `deps/sources.lock.json`. `make syntax-deps` restores the syntax sources; `make browser-deps` restores the complete compiler build inputs. npm dependencies use `package-lock.json`. Fetched source trees, caches and build tools are ignored by Git and excluded from source ZIPs. Prebuilt WASM and compressed recordings remain checked in. See [dependency management](docs/DEPENDENCIES.md), [maintenance](docs/MAINTENANCE.md), and [validation](docs/VALIDATION.md).

## Hosting and licensing

The Pages workflow prepares the WASI host and syntax highlighter and deploys `web/`. Select **GitHub Actions** as the Pages source in your repository. There is no compiler backend, bundler, runtime CDN or custom COOP/COEP header requirement.

Original code is MIT. Compiler and runtime components retain their upstream licenses; see [THIRD_PARTY.md](THIRD_PARTY.md). The browser syntax experiments in [kojix2/astv.cr](https://github.com/kojix2/astv.cr) inspired this project.
