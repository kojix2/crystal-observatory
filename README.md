# Crystal Observatory

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/2e0ee49e-7379-44a9-9201-d7e7f8ff58ec" />

:warning: This project is a prototype created using code generation by Codex.

A browser app for compiling Crystal, observing Visitors and type inference,
inspecting LLVM IR, and running WebAssembly. Source stays in the browser.

## Run locally

Install Node 24, npm and Crystal, then run:

```sh
make web-deps
make serve
```

Open <http://127.0.0.1:8000/> in a browser supporting WebAssembly exception handling.
Use `make serve PORT=8080` for another port. Prebuilt compiler assets are included;
LLVM is needed only to rebuild them.

See the [user guide](USER_GUIDE.md), [maintenance guide](docs/MAINTENANCE.md),
[dependency update policy](docs/DEPENDENCIES.md) and
[observation semantics](docs/ARCHITECTURE.md).

Original code is MIT; see [third-party licenses](THIRD_PARTY.md) for dependencies.
The browser syntax experiments in [kojix2/astv.cr](https://github.com/kojix2/astv.cr)
inspired this project.
