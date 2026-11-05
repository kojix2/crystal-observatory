import { messages } from './messages.js';

export const locales = ['en', 'ja', 'es', 'zh-CN', 'fr', 'de', 'ru'];

// No DOM/storage dependencies here: workers and model tests use the same errors.
let locale = 'en';
const listeners = new Set();
export const getLocale = () => locale;
export function t(key, values = {}) {
  const message = messages[key]?.[locale];
  if (message === undefined) throw new Error(`Missing UI translation: ${locale}/${key}`);
  return message.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
}
export function setLocale(value) {
  if (!locales.includes(value)) return;
  if (value === locale) return;
  locale = value;
  for (const listener of listeners) listener(locale);
}
export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export class UIError extends Error {
  constructor(key, values = {}) {
    super(t(key, values));
    this.key = key;
    this.values = values;
  }
}
export const errorText = (error) =>
  error.key ? t(error.key, error.values) : error.message || String(error);
export const errorPayload = (error) => ({
  error: error.message || String(error),
  errorKey: error.key,
  errorValues: error.values,
});
