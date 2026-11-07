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
Source, Tokens, AST, State, Types, LLVM IR, or Output. AST snapshots and history
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
filter button indicates an active filter. Search and filter changes keep the popup
open so conditions can be combined. History rows place names and results on separate
lines; a single-page list hides its unused page controls.
Output initially folds stdin and
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

**State** groups types and methods, constant registrations, variable declarations
and environments, initializer processing, and method specializations through the
selected event. Use the section buttons and their counts to choose what to inspect.
The types section initially selects an observed type. Operation rows show a short
context and result; expand a row for its holder, before/after values and navigation.
**Coverage** explains the observation boundaries. Operation buttons seek History;
source and AST buttons select nodes without moving History. Related-node buttons
can reveal a specialized method or initializer expression.

These entries are operations, not complete snapshots of Program, Type or Visitor
objects. Recorded context names are displayed as text, never used to merge object
identities. Specialization analysis does not establish cache insertion or reuse,
and initializer observations do not reconstruct a complete execution order. Each
section shows at most its latest 60 entries; **Earlier observations** rewinds to the
preceding entries. Missing observation metadata is distinguished from an empty
history prefix. Older and syntax-only traces remain usable.

Node details keeps the node kind, expression type and source location above
**Overview**, **Activities** and **IR** tabs. Code initially shows three lines;
**Show all … lines** expands the full recorded node text, including generated code.
**Open in Source** reveals its location in the source editor when that file is loaded.
Overview shows declarations, type changes, expansion and resolved calls recorded
through the selected event. The expression type also follows that event; a
declaration's expression type (for example `Nil`) is distinct from its declared type.
Activities and IR cover the whole recording, label entries after the selected
event, and show counts even when their tabs are closed. Selecting a History
activity or IR event opens the corresponding node tab. Playback keeps the current
tab for the same node; selecting another node starts with Overview. Arrow keys,
Home and End switch between node tabs without stepping History.

History initially shows one row per completed compiler stage, grouping its start,
end and intervening events. Open a stage with its arrow to see Visitor groups,
then open a Visitor to see individual events. Filtering keeps the enclosing stage
and matching event counts; declaration-only filtering shows operations directly.
Playback marks the current event inside a collapsed group without opening it.
Stages missing an end event stay visible individually, including compiler errors.
**Next activity** uses the current search, node and activity filters. Search for
`#7`, for example, to match node 7 exactly. Manually changing History pages stops
playback and shows the beginning of the page.

Drag the dividers in the History table header to resize its columns. Column widths
are saved across reloads. Double-click a divider to restore the default column
widths; **Reset layout** also resets them. With a divider focused, Left/Right changes
the width, Shift moves in larger steps, and Home restores the defaults.

The **Tokens** table supports the same column resizing controls. Drag any header
divider to resize its adjacent columns. Token column widths are saved separately
and survive language changes and recording reloads; **Reset layout** resets them too.

With **Follow history** enabled, clicking a History event or Visitor name opens its
node in AST, selecting a recorded snapshot containing it and opening folded ancestors.
The arrow beside a Visitor only opens or closes its event group. Disable Follow history
to keep the current view and AST snapshot while selecting events. A comparison that
already includes AST stays open. Playback and stepping update the event without
switching tabs. **Expand all** appears when the current AST has folded nodes.

The AST layout selector offers **Cards**, **Mind map** and **Radial tree**. Cards use
a compact, indented list with the node kind, code and type on three closely spaced
lines. Hover a card to read its full code and type. Select it for details, or use
its **+ / −** button (or focus the card and press **+ / −**) to fold a branch.

Mind map arranges compact, labeled nodes in branches extending to the left and right of each
root. Select a node to inspect its code and type. Use its **+ / −** button (or focus
the node and press **+ / −**) to expand or collapse a branch. Folds are shared with
Cards; **Expand all** opens every branch. Dashed node outlines mark repeated references.
Use the mouse wheel to zoom around the pointer; **Fit all** fits the visible branches
in the panel. Drag the background to move around a larger map; on touch
screens, swipe to scroll.

The **Types** dependency diagram uses the same mouse controls: wheel to zoom and
drag the background to move. **Fit all** fits the diagram in the panel. The type
activity history below the diagram scrolls normally.

The radial
view shows the whole snapshot as dots and circular branches, including descendants
folded in Cards. Roots sit at the center and leaves around the rim. Select a dot
to inspect its node, or hover for its name, code and type. Hollow dots mark repeated
references. The zoom slider spreads the branches out; scroll to explore and use
**Fit all** to return to the overview. Switching layouts preserves selection,
playback, the snapshot and branch folds; the chosen layout is saved in the browser.

The desktop workspace uses three columns: **History**, the selected observation
(AST, source, IR or output), and node/operation details. Drag the column dividers
to resize them, or collapse History with its header button. Widths and the
collapsed state are saved in the browser. Select a stage heading in History to
jump to its recorded start; its arrow opens or closes the stage without moving
playback. The operation inspector puts the observed Visitor, target and result first.
Code rewrites and macro expansions show a syntax-highlighted unified diff: red
minus rows are removed source, green plus rows are added source. Activities use
this display only for code transformations with recorded before/after source.
Unchanged source is identified explicitly because AST nodes can still differ.
Short before/after values such as types appear side by side; activities without a
recorded before value show just their observed result. IR instructions appear once,
with their measurement limits and a link to the IR view. Diagnostics keep their line breaks,
with a short summary and an expandable full message.
Use **Stage & role**, **Stack** and **Implementation** for background details,
or click the stage above the Visitor to open its context. Arrow keys, Home and End
switch the focused detail tab without stepping History. The chosen tab follows
playback; opening another recording returns to **Operation**.
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
