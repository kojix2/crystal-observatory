import { UIError } from '../i18n/index.js';
// Browser resource policy. Source size also matches the Crystal entrypoints.
export const LIMITS = Object.freeze({
  sourceBytes: 256 * 1024,
  traceBytes: 50 * 1024 * 1024,
  compileMs: 120_000,
  syntaxMs: 15_000,
  runMs: 10_000,
  outputBytes: 256 * 1024,
  programMemoryBytes: 256 * 1024 * 1024,
  programStackBytes: 8 * 1024 * 1024,
});
export function validateSource(source) {
  if (new TextEncoder().encode(source).length > LIMITS.sourceBytes)
    throw new UIError('error.sourceLimit');
}
