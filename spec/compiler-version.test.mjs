import test from 'node:test';
import assert from 'node:assert/strict';
import { compilerSourceURL, compilerVersionSummary } from '../web/core/compiler-version.js';
import { emptyTrace } from '../web/core/trace-io.js';

test('an unused editor never claims an engine version before analysis', () => {
  const trace = emptyTrace('42');
  assert.equal(trace.compiler_version, '');
  assert.equal(compilerVersionSummary(trace), '');
  assert.equal(compilerVersionSummary({ ...trace, compiler_version: '9.8.7' }), '');
});

test('the footer follows recorded compiler and LLVM versions independently of the host', () => {
  const trace = {
    mode: 'full',
    schema_version: 1,
    compiler_version: '1.22.2 + browser-crystal WASI/EH patches',
    host_compiler_version: '9.9.9',
    llvm_version: '20.1.8',
    prelude: 'empty',
  };
  assert.equal(
    compilerVersionSummary(trace),
    'Crystal 1.22.2 + browser-crystal WASI/EH patches · LLVM 20.1.8 · --prelude empty · schema 1',
  );
  trace.compiler_version = '2.3.4';
  trace.llvm_version = '24.0.1';
  assert.equal(
    compilerVersionSummary(trace),
    'Crystal 2.3.4 · LLVM 24.0.1 · --prelude empty · schema 1',
  );
});

test('syntax recordings retain their development version and omit unavailable LLVM metadata', () => {
  assert.equal(
    compilerVersionSummary({
      mode: 'syntax',
      schema_version: 1,
      compiler_version: '1.23.0-dev',
      host_compiler_version: '1.22.2',
      llvm_version: '',
    }),
    'Crystal 1.23.0-dev · schema 1',
  );
  assert.equal(compilerVersionSummary({ mode: 'syntax', schema_version: 1 }), '');
});

test('source links follow the release recorded in old, current and future traces', () => {
  for (const version of ['1.22.0', '1.22.2', '2.3.4']) {
    for (const suffix of ['', ' + browser-crystal WASI/EH patches', ' [1447d239f]']) {
      assert.equal(
        compilerSourceURL({ compiler_version: version + suffix }, 'semantic/main_visitor.cr'),
        `https://github.com/crystal-lang/crystal/blob/${version}/src/compiler/crystal/semantic/main_visitor.cr`,
      );
    }
  }
});

test('an exact source revision takes precedence, including for development builds', () => {
  const revision = '25b1e80df925f4b7a003f7455d79a1eccc39874f';
  assert.equal(
    compilerSourceURL(
      { compiler_version: '1.23.0-dev', compiler_revision: revision },
      'syntax/parser.cr',
    ),
    `https://github.com/crystal-lang/crystal/blob/${revision}/src/compiler/crystal/syntax/parser.cr`,
  );
  assert.equal(
    compilerSourceURL({ compiler_version: '1.22.2', compiler_revision: revision }, 'compiler.cr'),
    `https://github.com/crystal-lang/crystal/blob/${revision}/src/compiler/crystal/compiler.cr`,
  );
});

test('missing or unsafe metadata never invents a release tag or a master link', () => {
  for (const version of [undefined, '', 'WASI', '1.23.0-dev', '1.22.2-rc1', '1.22.2/../main']) {
    assert.equal(compilerSourceURL({ compiler_version: version }, 'compiler.cr'), null);
    assert.equal(
      compilerSourceURL({ compiler_version: version, compiler_revision: '../main' }, 'compiler.cr'),
      null,
    );
  }
});
