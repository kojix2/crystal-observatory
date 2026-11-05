// Adapted from live-codes/browser-crystal (MIT); see ../vendor/browser-crystal/LICENSE.
import { OpenFile, File, Directory, wasi as wasiDefs } from '../vendor/browser_wasi_shim/index.js';

// WORKAROUND: browser_wasi_shim 0.4.2 reallocates to the exact length on every
// extending write. LLVM emits many small positioned writes, making this quadratic.
// Keep spare capacity but report only logical content to reads, seeks and stat.
// Resize/allocate must first remove spare capacity: upstream copies the whole
// buffer and would otherwise throw when growing a file within that capacity.
// Remove this adapter when the pinned upstream shim supports amortized growth
// with logical-size semantics; keep vendor sources unchanged for easy updates.
const writtenLength = new WeakMap();

// A file's *contents*, as opposed to the buffer they are held in.
const logicalLength = (file) => writtenLength.get(file.data) ?? file.data.byteLength;

function patchFileGrowth() {
  const write = OpenFile.prototype.fd_write;
  const pwrite = OpenFile.prototype.fd_pwrite;
  const seek = OpenFile.prototype.fd_seek;
  const read = OpenFile.prototype.fd_read;
  const pread = OpenFile.prototype.fd_pread;
  const resize = OpenFile.prototype.fd_filestat_set_size;
  const allocate = OpenFile.prototype.fd_allocate;

  OpenFile.prototype.fd_read = function (size) {
    return read.call(
      this,
      Math.min(size, Math.max(0, logicalLength(this.file) - Number(this.file_pos))),
    );
  };
  OpenFile.prototype.fd_pread = function (size, offset) {
    return pread.call(
      this,
      Math.min(size, Math.max(0, logicalLength(this.file) - Number(offset))),
      offset,
    );
  };
  OpenFile.prototype.fd_filestat_set_size = function (size) {
    trimFile(this.file);
    return resize.call(this, size);
  };
  OpenFile.prototype.fd_allocate = function (offset, length) {
    trimFile(this.file);
    return allocate.call(this, offset, length);
  };

  const grow = (file, needed) => {
    // Against the buffer's capacity -- not `file.size`, which is the contents.
    if (needed <= file.data.byteLength) return;
    const size = Math.max(needed, file.data.byteLength * 2, 1 << 16);
    const grown = new Uint8Array(size);
    grown.set(file.data);
    // The contents' length has to travel with the buffer, or the next write
    // would take this buffer's capacity to be the file's length and ratchet the
    // tracked length up to it.
    const carried = logicalLength(file);
    file.data = grown;
    writtenLength.set(grown, carried);
  };

  const record = (file, end) => {
    writtenLength.set(file.data, Math.max(logicalLength(file), end));
  };

  OpenFile.prototype.fd_write = function (data) {
    if (this.file.readonly) return write.call(this, data);
    const end = Number(this.file_pos + BigInt(data.byteLength));
    grow(this.file, end);
    this.file.data.set(data, Number(this.file_pos));
    this.file_pos += BigInt(data.byteLength);
    record(this.file, end);
    return { ret: 0, nwritten: data.byteLength };
  };

  OpenFile.prototype.fd_pwrite = function (data, offset) {
    if (this.file.readonly) return pwrite.call(this, data, offset);
    const end = Number(offset + BigInt(data.byteLength));
    grow(this.file, end);
    this.file.data.set(data, Number(offset));
    record(this.file, end);
    return { ret: 0, nwritten: data.byteLength };
  };

  // The shim seeks to `data.byteLength` for WHENCE_END, which is now the buffer
  // and not the file: seeking to the end would leave a gap of zeros.
  OpenFile.prototype.fd_seek = function (offset, whence) {
    if (whence !== wasiDefs.WHENCE_END) return seek.call(this, offset, whence);
    const target = BigInt(logicalLength(this.file)) + offset;
    if (target < 0n) return { ret: wasiDefs.ERRNO_INVAL, offset: 0n };
    this.file_pos = target;
    return { ret: 0, offset: this.file_pos };
  };

  // ...and `File#size` (what `stat` reports) has to be the contents too.
  Object.defineProperty(File.prototype, 'size', {
    get() {
      return BigInt(logicalLength(this));
    },
  });
}

function trimFile(file) {
  const length = writtenLength.get(file.data);
  if (length !== undefined && length < file.data.byteLength) file.data = file.data.slice(0, length);
}

export function trimWrittenFiles(dir) {
  for (const entry of dir.contents.values()) {
    if (entry instanceof Directory) trimWrittenFiles(entry);
    else if (entry instanceof File) trimFile(entry);
  }
}

patchFileGrowth();
