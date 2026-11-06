// The UI icon vocabulary: each name maps to one Lucide glyph. scripts/prepare-web.mjs
// copies exactly these glyphs into web/vendor/lucide/icons.js, so adding an icon means
// adding a line here and regenerating. Commands reuse the glyph of the workflow stage
// they lead to, so the toolbar mirrors the compiler map.
export const lucideNames = {
  parse: 'code',
  prepare: 'layers',
  infer: 'waypoints',
  codegen: 'braces',
  object: 'cpu',
  link: 'link',
  run: 'play',
  play: 'play',
  pause: 'pause',
  stop: 'square',
  first: 'chevron-first',
  previous: 'chevron-left',
  next: 'chevron-right',
  last: 'chevron-last',
  collapse: 'chevron-left',
  disclosure: 'chevron-right',
  reset: 'rotate-ccw',
  help: 'circle-question-mark',
  settings: 'settings',
  maximize: 'maximize-2',
  close: 'x',
  download: 'download',
  external: 'external-link',
  info: 'info',
  menu: 'ellipsis',
  history: 'rotate-ccw-clock',
  reference: 'arrow-up-right',
};
