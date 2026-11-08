# WASI entrypoint: inputs and outputs are files in the Worker's memory filesystem.
# LLD runs separately in JavaScript after the observed LLVM module is emitted.
require "./lab/compilation"

Crystal::Config.path = "/src:/"
compiler = Crystal::Compiler.new
compiler.codegen_target = Crystal::Codegen::Target.new("wasm32-unknown-wasi")
prelude = File.read("/prelude.txt").strip
unless prelude == "prelude" || prelude == "empty"
  raise "Invalid prelude selection"
end
compiler.prelude = prelude
# PCRE2 is supplied as a WASI archive. This flag avoids pkg-config subprocesses;
# WASI has no host process API. This port also requires the single-thread runtime.
compiler.flags.concat ["without_mt", "use_pcre2"]
bundle = Observatory::Compilation.run(File.read("/main.cr"), "/main.cr", compiler,
  compiler_version: "1.22.0 + browser-crystal WASI/EH patches", object_path: "/out.o.wasm")
File.write("/trace.json", bundle.to_json)
exit(bundle.errors.empty? ? 0 : 1)
