require "./lab/syntax_engine"

# A fresh worker instance is used for every analysis: gc:none on wasm does
# not make repeated analyses accumulate until the tab runs out of memory.
module ObservatoryWasm
  extend self
  @@output = ""

  def analyze(ptr : UInt8*, size : Int32) : Int32
    if size < 0 || size > 262_144 || (ptr.null? && size > 0)
      bundle = Observatory::Bundle.new
      bundle.errors << "Source exceeds 256 KiB or invalid pointer"
      @@output = bundle.to_json
    else
      source = size == 0 ? "" : String.new(ptr, size)
      @@output = Observatory.syntax(source).to_json
    end
    @@output.to_unsafe.address.to_i32!
  end

  def length
    @@output.bytesize
  end

  def output_pointer
    @@output.empty? ? 0 : @@output.to_unsafe.address.to_i32!
  end

  def syntax_error(ex : Crystal::SyntaxException)
    bundle = Observatory.recorder.try(&.bundle) || Observatory::Bundle.new
    bundle.errors << "#{ex.filename}:#{ex.line_number}:#{ex.column_number}: #{ex.message}"
    @@output = bundle.to_json
  end
end

# The supplied Crystal WASI runtime traps instead of unwinding exceptions.
# Preserve the parser's real diagnostic before that trap. The JS adapter reads
# it once and discards the entire instance; execution never resumes in Crystal.
def raise(exception : Crystal::SyntaxException) : NoReturn
  ObservatoryWasm.syntax_error(exception)
  LibIntrinsics.debugtrap
  LibC.exit(1)
end

fun lab_alloc(size : Int32) : UInt8*
  return Pointer(UInt8).null if size <= 0 || size > 262_144
  LibC.malloc(size).as(UInt8*)
end

fun lab_free(ptr : UInt8*)
  LibC.free(ptr.as(Void*)) unless ptr.null?
end

fun lab_analyze(ptr : UInt8*, size : Int32) : Int32
  ObservatoryWasm.analyze(ptr, size)
end

fun lab_last_len : Int32
  ObservatoryWasm.length
end

fun lab_last_ptr : Int32
  ObservatoryWasm.output_pointer
end
