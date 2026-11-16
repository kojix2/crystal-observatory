import test from 'node:test';
import assert from 'node:assert/strict';
import '../web/runtime/wasi-file-growth.js';
import { File, OpenFile, wasi } from '../web/vendor/browser_wasi_shim/index.js';

test('geometric file growth preserves EOF, stat, positional reads, resize and allocate', () => {
  const file = new File(new Uint8Array()),
    fd = new OpenFile(file);
  fd.fd_write(new Uint8Array([65, 66, 67]));
  assert.equal(fd.fd_filestat_get().filestat.size, 3n);
  fd.fd_seek(0n, wasi.WHENCE_SET);
  assert.deepEqual([...fd.fd_read(100).data], [65, 66, 67]);
  assert.equal(fd.fd_read(100).data.length, 0);
  assert.deepEqual([...fd.fd_pread(100, 1n).data], [66, 67]);
  assert.equal(fd.fd_seek(-1n, wasi.WHENCE_END).offset, 2n);
  fd.fd_pwrite(new Uint8Array([68]), 3n);
  assert.equal(fd.fd_filestat_set_size(5n), 0);
  assert.deepEqual([...fd.fd_pread(100, 0n).data], [65, 66, 67, 68, 0]);
  fd.fd_filestat_set_size(1n);
  fd.fd_write(new Uint8Array([90]));
  assert.equal(fd.fd_allocate(0n, 10n), 0);
  assert.deepEqual([...fd.fd_pread(100, 0n).data], [65, 0, 90, 0, 0, 0, 0, 0, 0, 0]);
});

test('empty writes beyond EOF do not grow the file or allocate a sparse buffer', () => {
  const file = new File(new Uint8Array([65]));
  const fd = new OpenFile(file);
  const buffer = file.data;
  fd.fd_seek(1024n * 1024n, wasi.WHENCE_SET);
  assert.deepEqual(fd.fd_write(new Uint8Array()), { ret: 0, nwritten: 0 });
  assert.equal(file.size, 1n);
  assert.equal(fd.file_pos, 1024n * 1024n);
  assert.deepEqual(fd.fd_pwrite(new Uint8Array(), 2n * 1024n * 1024n), { ret: 0, nwritten: 0 });
  assert.equal(file.size, 1n);
  assert.equal(file.data, buffer);
  assert.deepEqual([...fd.fd_pread(10, 0n).data], [65]);
  const readonly = new OpenFile(new File(new Uint8Array([65]), { readonly: true }));
  assert.equal(readonly.fd_write(new Uint8Array()).ret, wasi.ERRNO_BADF);
  assert.equal(readonly.fd_pwrite(new Uint8Array(), 0n).ret, wasi.ERRNO_BADF);
});
