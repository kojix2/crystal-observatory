const colors = (ids) =>
  ids.map((id) => ({ id, variable: `--${id}`, labelKey: `settings.color.${id}` }));

// Add new settings groups here; the dialog and color validation use this registry.
export const colorGroups = [
  {
    id: 'interface',
    colors: colors([
      'bg',
      'paper',
      'ink',
      'muted',
      'line',
      'accent',
      'accent-ink',
      'selection',
      'header-bg',
      'header-ink',
    ]),
  },
  {
    id: 'code',
    colors: colors([
      'editor-bg',
      'editor-ink',
      'editor-highlight',
      'syntax-comment',
      'syntax-keyword',
      'syntax-string',
      'syntax-number',
      'syntax-function',
      'syntax-type',
      'syntax-symbol',
      'syntax-punctuation',
    ]),
  },
  {
    id: 'graph',
    colors: colors(['graph-bg', 'node-bg', 'node-selected', 'edge', 'type', 'type-bg']),
  },
  {
    id: 'visitors',
    colors: [
      ['visitor-top-level', 'TopLevelVisitor'],
      ['visitor-main', 'MainVisitor / Call'],
      ['visitor-normalizer', 'Normalizer'],
      ['visitor-cleanup', 'CleanupTransformer'],
      ['visitor-codegen', 'CodeGenVisitor'],
      ['visitor-codegen-functions', 'CodegenWellKnownFunctions'],
      ['visitor-to-s', 'ToSVisitor'],
      ['visitor-restrictions', 'TypeDeclarationVisitor / RestrictionsAugmenter'],
      ['visitor-guess', 'TypeGuessVisitor / HasSelfVisitor'],
      [
        'visitor-initializers',
        'InstanceVarsInitializerVisitor / ClassVarsInitializerVisitor / FixMissingTypes',
      ],
      ['visitor-macros', 'MacroInterpreter / ExpandableNode'],
    ].map(([id, label]) => ({ id, variable: `--${id}`, label })),
  },
];

export const colorSettings = colorGroups.flatMap((group) => group.colors);
export const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

export function normalizeSettings(value) {
  const result = { colors: {} };
  for (const { id } of colorSettings) {
    const color = value?.colors?.[id];
    if (isColor(color)) result.colors[id] = color.toLowerCase();
  }
  return result;
}
