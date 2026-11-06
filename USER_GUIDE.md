# User guide

For local setup, see [README.md](README.md). Use HTTP rather than opening files
directly, and use a browser supporting standardized WebAssembly exception handling.
To serve the prebuilt app without Crystal, use
`ruby -run -e httpd web -p 8000 --bind-address=127.0.0.1` (requires WEBrick).

## Compile and inspect

Enter Crystal in **Source** and choose **Compile & run**, or **Compile → IR** to
compile without execution. **Output** accepts stdin and a JSON array of arguments.
**Parse only** uses a separate lightweight lexer/parser, without semantic analysis.

Selecting an example loads its source; **Example trace** opens its bundled
recording. **Open trace…** and **Save trace JSON** import and export recordings.
Compilation always analyzes the current editor contents.

**Compare…** shows two views of the same recording. AST snapshots and history
playback can refer to different times; Types follows the selected history event.
Editing source does not update an existing AST or IR. Escape exits maximization;
**End comparison** returns to one view.

## Read observations

History selects an event; the node inspector independently follows the selected
node. Selecting a node does not replace the operation being inspected. Rewinding
replays observed types and declarations, not a complete AST history.

Activities record measured decisions and changes. **Not instrumented** and
**No covered activity recorded** have different meanings; neither proves that
the compiler did nothing. Errors and truncation make observations incomplete.

Declarations show observed registrations rather than a complete symbol table.
A `Def` declaration's `Nil` type is not its method's return type. LLVM instruction
observations can include child emission and are not exclusive output of one node.
See [observation semantics](docs/ARCHITECTURE.md) for the interpretation rules.

## Runtime and hosting

Generated programs target WASI. Native processes, sockets, host files, OS threads
and arbitrary native libraries are unavailable, including macros that need
`run` or `system`. Generated programs have no GC and are unsuitable for long runs.
Stop terminates the active Worker; oversized input, output or execution is limited.

GitHub Pages serves `web/`. Select **GitHub Actions** as the Pages source and run
the **GitHub Pages** workflow. Project subpaths are supported; no compiler backend,
SharedArrayBuffer or custom COOP/COEP headers are required.
