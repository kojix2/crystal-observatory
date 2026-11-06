// The full compiler's order comes from compiler.cr, semantic.cr and
// src/lab/compilation.cr. These are responsibilities, not inferred trace events.
export const compilerStages = [
  {
    id: 'parse',
    phase: 'Parse',
    group: 'parse',
    input: 'source',
    output: 'ast',
    driver: 'Parser → Normalizer',
    file: 'compiler.cr',
  },
  {
    id: 'top',
    phase: 'Semantic (top level)',
    group: 'prepare',
    input: 'ast',
    output: 'definitions',
    driver: 'TopLevelVisitor',
    file: 'semantic/top_level_visitor.cr',
  },
  {
    id: 'new',
    phase: 'Semantic (new)',
    group: 'prepare',
    input: 'definitions',
    output: 'constructors',
    driver: 'Program#define_new_methods',
    file: 'semantic/new.cr',
  },
  {
    id: 'declarations',
    phase: 'Semantic (type declarations)',
    group: 'prepare',
    input: 'constructors',
    output: 'variableTypes',
    driver: 'TypeDeclarationProcessor → TypeDeclarationVisitor / TypeGuessVisitor (HasSelfVisitor)',
    file: 'semantic/type_declaration_processor.cr',
  },
  {
    id: 'abstract',
    phase: 'Semantic (abstract def check)',
    group: 'prepare',
    input: 'variableTypes',
    output: 'checkedDefinitions',
    driver: 'AbstractDefChecker',
    file: 'semantic/abstract_def_checker.cr',
  },
  {
    id: 'restrictions',
    phase: 'Semantic (restrictions augmenter)',
    group: 'prepare',
    input: 'checkedDefinitions',
    output: 'restrictions',
    driver: 'RestrictionsAugmenter',
    file: 'semantic/restrictions_augmenter.cr',
  },
  {
    id: 'ivars',
    phase: 'Semantic (ivars initializers)',
    group: 'prepare',
    input: 'restrictions',
    output: 'ivars',
    driver: 'InstanceVarsInitializerVisitor',
    file: 'semantic/instance_vars_initializer_visitor.cr',
  },
  {
    id: 'cvars',
    phase: 'Semantic (cvars initializers)',
    group: 'prepare',
    input: 'ivars',
    output: 'initializers',
    driver: 'ClassVarsInitializerVisitor',
    file: 'semantic/class_vars_initializer_visitor.cr',
  },
  {
    id: 'main',
    phase: 'Semantic (main)',
    group: 'infer',
    input: 'initializers',
    output: 'typedAst',
    driver: 'MainVisitor → FixMissingTypes → CleanupTransformer',
    file: 'semantic/main_visitor.cr',
  },
  {
    id: 'cleanup',
    phase: 'Semantic (cleanup)',
    group: 'infer',
    input: 'typedAst',
    output: 'cleanedTypes',
    driver: 'Program#cleanup_types / #cleanup_files → CleanupTransformer',
    file: 'semantic/cleanup_transformer.cr',
  },
  {
    id: 'struct',
    phase: 'Semantic (recursive struct check)',
    group: 'infer',
    input: 'cleanedTypes',
    output: 'codegenReady',
    driver: 'RecursiveStructChecker',
    file: 'semantic/recursive_struct_checker.cr',
  },
  {
    id: 'codegen',
    phase: 'Codegen (crystal → LLVM IR)',
    aliases: ['Codegen (crystal)'],
    group: 'codegen',
    input: 'codegenReady',
    output: 'ir',
    driver: 'CodeGenVisitor',
    file: 'codegen/codegen.cr',
  },
  {
    id: 'object',
    phase: 'LLVM → WebAssembly object',
    group: 'object',
    input: 'ir',
    output: 'object',
    driver: 'LLVM TargetMachine',
    file: null,
  },
];

export const pipelineGroups = [
  { id: 'parse', output: 'ast' },
  { id: 'prepare', output: 'initializers' },
  { id: 'infer', output: 'codegenReady' },
  { id: 'codegen', output: 'ir' },
  { id: 'object', output: 'object' },
  { id: 'link', output: 'wasm', outsideTrace: true },
  { id: 'run', output: 'result', outsideTrace: true },
].map((group) => ({
  ...group,
  stages: compilerStages.filter((stage) => stage.group === group.id),
}));

export function compilerStage(event) {
  if (!event) return undefined;
  const phase =
    event.phase || (['phase_enter', 'phase_leave'].includes(event.kind) ? event.detail : '');
  return compilerStages.find((stage) => stage.phase === phase || stage.aliases?.includes(phase));
}

// Keep observed availability separate from playback state. No event means no
// evidence, even if a later stage was recorded (e.g. imported/partial recordings).
export function indexCompilerStages(trace) {
  const records = new Map();
  for (const event of trace.events) {
    const stage = compilerStage(event);
    if (!stage) continue;
    if (!records.has(stage.id)) records.set(stage.id, { first: event.index });
  }
  return records;
}
