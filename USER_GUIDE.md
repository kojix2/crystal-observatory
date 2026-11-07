# User guide

For local setup, see [README.md](README.md). Use HTTP rather than opening files
directly, and use a browser supporting standardized WebAssembly exception handling.
To serve the prebuilt app without Crystal, use
`ruby -run -e httpd web -p 8000 --bind-address=127.0.0.1` (requires WEBrick).

## Compile and inspect

Enter Crystal in **Source** and choose **Compile & run**, or **Compile to IR** to
compile without execution. **Output** accepts stdin and a JSON array of arguments.
**Parse only** uses a separate lightweight lexer/parser, without semantic analysis.

Selecting an example loads its source; **Example trace** opens its bundled
recording. While nothing is loaded, History lists the examples so a recording opens
with one click. **Open…** and **Save** in the History header import and export
recordings.
Compilation always analyzes the current editor contents.

**Compare…** shows any two different views of the same recording side by side:
Source, Tokens, AST, Declarations, Types, LLVM IR, or Output. AST snapshots and history
playback can refer to different times; Types follows the selected history event.
Editing source does not update an existing AST or IR. Escape exits maximization;
**End comparison** returns to one view.

## On a smartphone

At widths up to 960 px, use the bottom navigation: **Work**, **History**,
and **Details**. Work contains the source editor and all observation tabs.
Swipe the tab row to reach more views. Compile & run and Stop remain
in a single top toolbar; its options button opens Compile to IR, Parse only,
Compare, language, settings, help, layout reset, and GitHub. Editing remains available while compilation runs.

Selecting a History event or stage heading opens Details, with the operation
above the node information. Return to History to continue from the same selection,
filters, and scroll position. Playback and stepping stay in the current screen.
Selecting an AST node updates its details and source location without leaving
AST. The existing Details navigation opens that node's information; the Source
tab reveals its line when the source still matches the recording. Returning
without a new selection keeps the reading position. History events and stage
headings open their operation details, while playback and stepping stay in place.
The active observation tab stays visible as views change.

Previous, Play, Next and the seek bar stay visible in History. Its filter button
opens search, filters, jumps, speed, first/last event, and recording Open/Save
controls. Closing this popup gives the space back to the event list. A highlighted
filter button indicates an active filter. Output initially folds stdin and
arguments under **Input & arguments**; expanding it preserves the entered values.

Comparisons stack the two views vertically and scroll within Work. Code and graphs
can scroll sideways inside their own panels.
When a keyboard leaves very little vertical space during source editing, the
editor and compile controls take priority. Dismiss the keyboard to restore the
navigation and other controls.

Rotating the device or returning to a desktop-sized window preserves source,
selection, and comparison. Desktop divider sizes and collapsed panels remain
separate from phone navigation. The phone view always starts in Work on reload.

## Read observations

History selects an event; the node inspector independently follows the selected
node. Selecting a node does not replace the operation being inspected. Rewinding
replays observed types and declarations, not a complete AST history.

History initially shows one row per completed compiler stage, grouping its start,
end and intervening events. Open a stage with its arrow to see Visitor groups,
then open a Visitor to see individual events. Filtering keeps the enclosing stage
and matching event counts; declaration-only filtering shows operations directly.
Playback marks the current event inside a collapsed group without opening it.
Stages missing an end event stay visible individually, including compiler errors.

Drag the dividers in the History table header to resize its columns. You can also
focus a divider and use Left/Right (Shift for larger steps). Column widths are
saved across reloads. Double-click a divider or press Home to restore the default
column widths; **Reset layout** also resets them.

With **Follow history** enabled, clicking a History event or Visitor name opens its
node in AST, selecting a recorded snapshot containing it and opening folded ancestors.
The arrow beside a Visitor only opens or closes its event group. Disable Follow history
to keep the current view and AST snapshot while selecting events. A comparison that
already includes AST stays open. Playback and stepping update the event without
switching tabs. **Expand all** appears when the current AST has folded nodes.

The AST layout selector switches between **Cards** and **Radial tree**. The radial
view shows the whole snapshot as dots and circular branches, including descendants
folded in Cards. Roots sit at the center and leaves around the rim. Select a dot
to inspect its node, or hover for its name, code and type. Hollow dots mark repeated
references. The zoom slider spreads the branches out; scroll to explore and use
**Fit all** to return to the overview. Switching layouts preserves selection,
playback, the snapshot and card folds; the chosen layout is saved in the browser.

The desktop workspace uses three columns: **History**, the selected observation
(AST, source, IR or output), and node/operation details. Drag the column dividers
to resize them, or collapse History with its header button. Widths and the
collapsed state are saved in the browser. Select a stage heading in History to
jump to its recorded start; its arrow opens or closes the stage without moving
playback. The operation inspector shows the selected event's stage, incoming
state, outgoing state and implementation, followed by the observed Visitor and
operation.
These handoffs describe compiler responsibilities, not additional measured events.
Select the **Link (LLD)** event in History to inspect the input object, specified
libraries, output size, elapsed time, exit code, diagnostics and actual link
command. New full compilations record the link result in History, including failures; saved traces
retain these details. Older recordings without a link result do not show a link
event; compile the source again to inspect its measurements. Execution remains
outside the trace. Parse-only uses a separate syntax engine.

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
