# Visitor activities

Activities are observations of the pinned Crystal 1.22.0 compiler, not a second
implementation of its algorithms. Visits describe dispatch; activities describe
decisions, mutations, or generated results. Both remain in chronological order.

## Schema and coverage

Schema 1 and declarations version 1 remain unchanged. The optional
`activity_coverage` array contains `{visitor, node_kinds, activities}` entries.
Visitor names retain their complete namespace. `*` means any AST kind eligible
for that particular hook, **not** that every operation of that Visitor is observed.
Multiple entries for a Visitor are additive. Coverage describes instrumentation
capability, not whether a stage ran, a branch was reached, or an operation occurred.
Each entry groups a hook family's node kinds and activity vocabulary; not every
listed operation applies to every node kind in that family.

An activity event has `kind: "activity"`, `activity`, `visitor`, `node_id`, and the
ordinary event index, phase, depth, and parent node. Optional strings include
`before`, `after`, `reason`, `detail`, `parent_visitor`, `llvm_function`, and
`llvm_block`; `related_id` identifies evidence, an origin, or an output AST node.
Reasons and compiler-provided values are internal identifiers, not translated
UI explanations. A failed operation uses an explicit failure reason, not a
success-shaped result.

The source of the coverage declaration is
[Recorder#enable_activities](../src/lab/activity_hooks.cr).
Only matching Visitor/node-kind pairs are covered. An absent field, unknown
Visitor, or unmatched node kind means **not instrumented**. Even for a covered
pair, an empty list means **no covered activity recorded**, not “did nothing.”
Errors and truncation additionally make incompleteness explicit.

## Observation inventory

Paths below are relative to the pinned compiler's `compiler/crystal/` directory.
The [source instrumentation](../scripts/instrument_activities.cr) and
[reopened hooks](../src/lab/activity_hooks.cr) define the exact boundaries.

| Visitor | Node / implementation point | Activity and recorded evidence | Success / decision boundary |
|---|---|---|---|
| TopLevelVisitor | ClassDef, ModuleDef, Include, Extend, Def; `semantic/top_level_visitor.cr` registration points | `declare_type`, `declare_fun`; declaration action and owner/signature; existing declaration IDs remain available | After the real registration succeeds; method replacement metadata remains on the original declaration event |
| TopLevelVisitor | Macro, Assign/TypeDeclaration, initialize Def | `declare_fun` for macros, `declare_const` with owner/name/value, `register_initializer` linking generated `new` | After `add_macro`, constant insertion, or insertion in `new_expansions` |
| TypeDeclarationVisitor | TypeDeclaration/UninitializedVar, ExternalVar, FunDef; `semantic/type_declaration_visitor.cr` | `declare_var` with variable/owner/resolved type; C field or external variable registration; `declare_fun` with external signature | After the type is validated and installed; TypeDeclaration CodeErrors emit `resolution_failed` and are rethrown |
| TypeGuessVisitor | InstanceVar/ClassVar; `add_type_info`, `add_instance_var_type_info`, `process_assign` | `guess_type`, `merge_guess` with previous/resulting candidates, `reject_guess` with value and forbidden type when available | After candidate storage, or a failed assignment guess; explicit existing restrictions are not reported as guesses |
| TypeGuessVisitor | InstanceVar, initialize Def | `register_initializer` with included/excluded-after-self assignment and final variable set | After initialization-info collection; the set may already include a variable assigned before `self` |
| HasSelfVisitor | Expression checked by `check_has_self`; self.class Call | `check_self` with true/false and `self_detected`, `self_not_detected`, or `self_class_excluded`; calling Visitor retained | After the actual helper completes, or the actual exclusion branch; not a separate compiler stage |
| RestrictionsAugmenter | Assign, Arg; `visit(Assign)`, `augment` | `add_restriction` links argument, owner/Def and assignment; generated `new` argument linked separately. `skip_restriction` explains conditional assignment or reassigned argument | After restriction assignment; skip events follow the compiler's conditional nesting and argument invalidation rules |
| InstanceVarsInitializerVisitor | InstanceVar; `type_instance_var`, `finish` | `register_initializer` with collected/registered/deferred states and owning scope, `autocast`, `assign_type` with typed value | After collection/registration/cast/type checking; generic deferral records the actual early-exit branch |
| ClassVarsInitializerVisitor | Assign/TypeDeclaration and initializer expression; `type_class_var`, `Program#visit_class_vars_initializers` | `register_initializer`, `discard_initializer` linked to replacement, literal-first typing order, `autocast`, final `assign_type` | After candidate replacement, discarded flag update, or successful typing; ordering detail distinguishes simple literals from complex values |
| MainVisitor | Assign, If/While, Path, Call; `semantic/main_visitor.cr`, `semantic/call.cr` | Local/cumulative types and scope, `narrow_type` before/after with variable name, constant initialization, `instantiate_def` begin/end linked to typed Def, `resolve_target` | After variable/filter updates or constant initialization; instantiation end only after body analysis returns; dispatch only when target identities change |
| FixMissingTypes | Def, Block, ProcPointer and its Call; `semantic/fix_missing_types.cr` | `fix_missing_type` with empty previous type, completed type, reason and originating node | Immediately after each guarded direct type assignment, including ProcLiteral Def, target Def and ProcPointer Call; also emits legacy `type` for replay |
| Normalizer | All changed transforms; Expressions and comparison Call | `rewrite` before/after with input node kind; comparison temporary and related assignment; `remove_dead_code` with removed expressions | After a real transform, temporary creation, or the actual terminator branch; no inferred rewrite reason |
| CleanupTransformer | All changed transforms; If, untyped expressions, Expressions | `rewrite`, `simplify_condition` with true/false and discarded branch, `replace_untyped` linked to replacement, `remove_dead_code` after no-return/terminator | After the real transform/replacement; dead-code records follow the compiler's `flatten_collect` result |
| MacroInterpreter | Call, Assign, MacroExpression, MacroIf, MacroFor | Argument/assignment binding, evaluated expression, selected branch, range/array/hash iteration index and value, emitted source on the expansion Call | After bindings/evaluation and before executing the selected body/iteration; final source is the actual interpreter buffer |
| ToSVisitor | Root of a source-serialization dispatch | `serialize_source`, compiler serialization reason and calling Visitor when known | After successful dispatch, excluding Observatory's muted serialization; unknown purposes remain unknown |
| CodeGenVisitor | AST visit and generated Def | `emit_instructions` with newly observed instruction identities in the final insertion block, LLVM function/block; `begin_function` links Def and mangled LLVM function name | Compare entry-function instruction identities to final block; function event follows signature creation |
| CodeGenVisitor::CodegenWellKnownFunctions | FunDef; `codegen/codegen.cr` | `select_well_known_fun` with runtime-required or not-runtime-required reason and function name | Selected event follows successful generation; rejected event comes from the actual default branch |

`set_type` additionally emits an `assign_type` activity attributed to the recorded
Visitor context (or `binding` when no Visitor context is known). Existing `type`,
`rewrite`, `dispatch`, declaration, and IR-position events remain available for
compatibility. They must not be added a second time to the activity timeline.

## Boundaries and attribution

- The Recorder maintains the actual current dispatch node even for visits that
  are not recorded. A helper running inside library code must not accidentally
  attribute its decisions to the nearest recorded user node.
- Activities obey muting, user/attached-node selection, stable IDs, and event/node
  limits. Recording values is muted. Formatting the record itself does not
  produce ToSVisitor activities.
- LLVM deltas **include child emission**, and cover only the final insertion
  block. They are not exclusive per-node instruction attribution, nor a complete
  per-visit diff across every block. Legacy `ir` records remain insertion-position
  samples with up to six trailing instructions.
- `begin_function` records function-signature creation, not successful completion
  of the entire function body. Well-known runtime functions outside the
  user/attached-node selection are not pulled into the trace just to populate
  activities. Example 13 demonstrates the real rejection decision on a user fun.
- Macro branches/iterations record actual execution paths, not every expression
  evaluated internally. Direct macro variable writes outside the instrumented
  argument/assignment paths are not claimed as fully covered.
- Source transformations retain actual before/after text and mechanical node-kind
  reasons. The UI does not infer a semantic rationale from the text diff.
- This is not exhaustive compiler coverage: alias/FFI variants, every internal
  variable update, all generic instantiations and every formatting purpose are
  not reconstructed. The UI displays coverage rather than claiming completeness.

## UI and verification

History groups summarize at most two distinct recorded activity kinds, with node
IDs retained for child activities. Filtering a subtype also filters these
summaries. The node inspector indexes both target and related nodes and groups
activities by their recorded phase; links seek without replacing a manually
selected node. HasSelfVisitor remains visibly subordinate to its calling Visitor.
The operation inspector distinguishes observed values from supplemental Visitor
roles and lists the instrumented operations for the selected node kind.

AST dots mark nodes with activity records; highlighting follows the selected
phase/Visitor. Types includes type-related activity links. LLVM links navigate to
the recorded function/block while retaining the child-emission warning.

Examples 10–14 supplement the original nine recordings. Their traces exercise
all fifteen Visitors collectively. Source-fragment tests reject missing or
duplicate matches and repeated instrumentation before any file is written.
Node tests cover validation, rewind, missing coverage, summaries, navigation,
localization and recorded decisions; browser-pipeline tests execute the examples.

Rebuild with `LLVM_CONFIG=llvm-config-20 make browser`, then `make samples`.
If an existing generated build tree has an older fingerprint, use a fresh
`BROWSER_BUILD_DIR` rather than editing or silently reusing that tree.
