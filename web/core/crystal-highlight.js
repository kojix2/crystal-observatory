export const escapeCode = (code) =>
  code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Prism's Crystal grammar is installed locally, with no runtime CDN. It only
// colors presentation; the real compiler remains the authority for diagnostics.
export function highlightCrystal(code) {
  const prism = globalThis.Prism;
  if (!prism?.languages.crystal) return escapeCode(code);
  try {
    return prism.highlight(code, prism.languages.crystal, 'crystal');
  } catch {
    return escapeCode(code);
  } // Incomplete edits must stay visible/editable.
}
export function renderCrystal(element, code) {
  element.innerHTML = highlightCrystal(code);
}
