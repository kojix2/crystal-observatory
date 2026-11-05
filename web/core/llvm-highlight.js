import { escapeCode } from './crystal-highlight.js';

export function highlightLLVM(code) {
  const prism = globalThis.Prism;
  if (!prism?.languages.llvm) return escapeCode(code);
  try {
    return prism.highlight(code, prism.languages.llvm, 'llvm');
  } catch {
    return escapeCode(code);
  }
}

export function renderLLVM(element, code) {
  element.innerHTML = highlightLLVM(code);
}
