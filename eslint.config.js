export default [{
  ignores: ['web/vendor/**'],
}, {
  files: ['web/**/*.js'],
  languageOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
    globals: Object.fromEntries([
      'document', 'window', 'localStorage', 'self', 'location', 'crypto', 'performance',
      'Worker', 'Blob', 'URL', 'Response', 'Option', 'Event', 'AbortController', 'DecompressionStream',
      'TextEncoder', 'TextDecoder', 'WebAssembly', 'ResizeObserver', 'fetch',
      'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
      'requestAnimationFrame', 'cancelAnimationFrame',
    ].map(name => [name, 'readonly'])),
  },
  rules: {
    'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    'no-undef': 'error',
  },
}];
