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
