# Observation semantics

The full compiler and the lightweight syntax engine use different pinned Crystal
versions. A syntax-only AST is not evidence of the full compiler's semantic
behavior; each recording identifies its compiler version.

## Identity and replay

An analyzed AST is a graph: calls can reference specialized methods, and expansions
can share nodes or form cycles. Node IDs are stable within one recording only.
Semantic type IDs and AST node IDs are separate identities; display names and
method signatures must not be used as identity keys.

Snapshots are point-in-time graphs, not reversible AST diffs. Type, dependency and
declaration events can be replayed, but the AST cannot be reconstructed at every
event. Event indices are zero-based; playback positions and snapshot `at_event`
values count events already recorded.

Declarations describe observed registrations, not a complete symbol table.
Replacing a method must use the compiler's reported replacement identity, rather
than guessing from its name. A declaration expression's `Nil` type is unrelated
to the return type of invoking that method.

## Observation boundaries

Visits record actual dispatch, while activities record selected decisions and
mutations. Direct compiler calls and assignments outside the hooks may be absent.
Serialization by ToSVisitor is formatting, not semantic analysis. Do not infer a
compiler decision or semantic rationale from an unexplained text difference.

Coverage describes instrumentation capability, not proof that a stage or branch
ran. Keep these states distinct: no coverage metadata, an uncovered node/Visitor
pair, a covered pair with no activity, and an incomplete recording due to errors
or truncation. Preserve legacy events without adding them again as activities.

Keep the actual dispatch context even when that node is not recorded, so library
helpers are not attributed to an outer user node. Recording and serialization
must remain muted to avoid observing the recorder's own work.

LLVM instruction observations include child emission and only cover the final
insertion block. They are neither exclusive per-node output nor complete
multi-block diffs. Function-signature creation does not imply that generating
the function body succeeded. LLVM optimization and linker internals are unobserved.

Runtime limits are defined in `web/core/limits.js` and the Crystal entrypoints.
They bound resources, not compiler coverage or a complete memory sandbox.
