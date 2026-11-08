// WASI host only: compile policy and linker arguments belong to compiler-pipeline.js.
// Adapted from live-codes/browser-crystal (MIT); see ../vendor/browser-crystal/LICENSE.
import {
  ConsoleStdout,
  Directory,
  File,
  OpenFile,
  PreopenDirectory,
  WASI,
} from '../vendor/browser_wasi_shim/index.js';
import { trimWrittenFiles } from './wasi-file-growth.js';
const ENCODER = new TextEncoder();
export const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

const asFile = (data) => new File(typeof data === 'string' ? ENCODER.encode(data) : data);

// browser_wasi_shim's Directory is a Map of name -> File|Directory. Build the
// tree from flat paths; the returned Directory is what the preopen wraps, and
// its `contents` Map is shared, so files the guest writes show up in it too.
function buildTree(entries) {
  const root = new Directory(new Map());
  for (const [path, data] of entries) {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    let dir = root;
    for (const part of parts) {
      let child = dir.contents.get(part);
      if (!(child instanceof Directory)) {
        child = new Directory(new Map());
        dir.contents.set(part, child);
      }
      dir = child;
    }
    dir.contents.set(name, asFile(data));
  }
  return root;
}

// A stdout/stderr that both streams text out as it arrives and keeps it.
function textSink(onText) {
  const decoder = new TextDecoder();
  let text = '';
  const fd = new ConsoleStdout((chunk) => {
    const decoded = decoder.decode(chunk, { stream: true });
    if (decoded) {
      text += decoded;
      onText?.(decoded);
    }
  });
  return {
    fd,
    flush() {
      const rest = decoder.decode();
      if (rest) {
        text += rest;
        onText?.(rest);
      }
    },
    get text() {
      return text;
    },
  };
}

/**
 * Run a WASI command module in this package's own host.
 *
 * @param {WebAssembly.Module|Uint8Array} moduleOrBytes
 * @param {object} options
 * @param {string[]} options.args
 * @param {Array<[string, string|Uint8Array]>} [options.entries]
 * @param {string} [options.stdin]
 * @param {string} [options.stage] - which stage this run is, so the caller can
 *   treat the compiler's chatter differently from the program's output: only the
 *   program's output keeps its colour.
 */
export async function runCommand(
  moduleOrBytes,
  { args, env = [], entries = [], stdin = '', onStdout, onStderr, stage },
) {
  const root = buildTree(entries);
  const stdout = textSink((text) =>
    onStdout?.(stage === 'running' ? text : stripAnsi(text), stage),
  );
  const stderr = textSink((text) =>
    onStderr?.(stage === 'running' ? text : stripAnsi(text), stage),
  );

  // fd 0 is a file holding the caller's stdin: a program that calls `gets`
  // reads it, and one that does not never looks. The compiler and the linker
  // are given the empty string -- neither reads stdin at all.
  const fds = [
    new OpenFile(new File(ENCODER.encode(stdin))),
    stdout.fd,
    stderr.fd,
    new PreopenDirectory('/', root.contents),
  ];

  // `debug: false` is not the default: the shim enables its logging when the
  // option is undefined, which would put "wasi:" lines in the output.
  const wasi = new WASI(args, env, fds, { debug: false });
  const module =
    moduleOrBytes instanceof WebAssembly.Module
      ? moduleOrBytes
      : await WebAssembly.compile(moduleOrBytes);
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport,
  });

  let exitCode;
  try {
    exitCode = wasi.start(instance);
  } catch (error) {
    stdout.flush();
    stderr.flush();
    const diagnostic = stage === 'running' ? '' : stripAnsi(stderr.text || stdout.text);
    if (diagnostic) throw new Error(diagnostic, { cause: error });
    throw error;
  }
  stdout.flush();
  stderr.flush();

  // A file written above is still over-allocated; make its length exact before
  // anything can read it (including the next stage, which runs in another call).
  trimWrittenFiles(root);

  return { exitCode, stdout: stdout.text, stderr: stderr.text, root };
}
