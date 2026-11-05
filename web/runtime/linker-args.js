// Adapted from live-codes/browser-crystal (MIT); see ../vendor/browser-crystal/LICENSE.
// The same link line clang's driver uses under `-fwasm-exceptions`, with the
// libraries mounted at `lib/` and `lib/eh/`. `lib/eh` comes first so `-lc++abi`
// and `-lunwind` resolve to the wasm-EH variants.
//
// `-lc++` is deliberately absent: the compiler's own cross-compile echo is
// `wasm-ld out.o.wasm -o out.o -lc`, and a Crystal program has no C++ in it --
// what it does need from the C++ runtime is the wasm EH personality and
// `_Unwind_*`, which are libc++abi and libunwind. Dropping it is 2.7 MB of the
// payload. If a program ever does need it, the linker says so by name.
//
// lld dispatches on argv[0], and this is a *generic* lld: without the leading
// "wasm-ld" it refuses to do anything. Every host this runs under takes the
// program name separately, so it is stripped when the line is handed over.
export const LINKER_ARGS = [
  'wasm-ld',
  '-m',
  'wasm32',
  '-Llib/eh',
  '-Llib',
  'out.o.wasm',
  '-lpcre2-8',
  '-lc++abi',
  '-lunwind',
  '-lwasi-emulated-signal',
  '-lwasi-emulated-mman',
  '-lwasi-emulated-getpid',
  '-lwasi-emulated-process-clocks',
  '-lc',
  'lib/libclang_rt.builtins.a',
  '-o',
  'out.wasm',
];
