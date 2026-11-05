require "compiler/requires"
require "./full_hooks"

module Observatory
  # One observed compiler run. The WASI entrypoint configures the target and files;
  # this layer owns recorder lifetime, diagnostics, LLVM verification and emission.
  module Compilation
    def self.run(source : String, filename : String, compiler : Crystal::Compiler,
                 compiler_version : String, object_path : String) : Bundle
      rec = Recorder.new(source, filename, compiler_version)
      rec.bundle.mode = "full"
      rec.bundle.declarations_version = 1
      rec.enable_activities
      rec.bundle.prelude = compiler.prelude
      rec.bundle.llvm_version = LLVM.version
      Observatory.recorder = rec
      begin
        raise "Source exceeds 256 KiB" if source.bytesize > 262_144
        # Invoke semantic analysis once, then capture the same LLVM module that
        # will be emitted. Compiler#compile would otherwise also invoke a linker.
        compiler.no_codegen = true
        compiler.color = false
        compiler.debug = Crystal::Debug::None
        compiler.stdout = STDERR
        result = compiler.compile(Crystal::Compiler::Source.new(filename, source), "unused")
        rec.root = result.node
        rec.bundle.target = result.program.target_machine.triple
        modules = result.program.progress_tracker.stage("Codegen (crystal → LLVM IR)") do
          result.program.codegen(result.node, single_module: true, debug: Crystal::Debug::None)
        end
        rec.bundle.llvm_ir = String.build do |io|
          modules.each_value do |info|
            info.mod.verify
            io << info.mod.to_s
          end
        end
        result.program.progress_tracker.stage("LLVM → WebAssembly object") do
          result.program.target_machine.emit_obj_to_file(modules.values.first.mod, object_path)
        end
        rec.event("complete", detail: "Real compiler + LLVM in WebAssembly; verified IR and emitted object; LLD and execution follow in the browser")
      rescue ex : Crystal::CodeError
        rec.bundle.errors << ex.to_s
        rec.event("error", detail: ex.message || ex.class.name)
      rescue ex
        rec.bundle.errors << "#{ex.class}: #{ex.message}"
        rec.event("error", detail: ex.message || ex.class.name)
      ensure
        # Even failed compilations must detach the recorder before serialization.
        Observatory.recorder = nil
      end
      rec.bundle
    end
  end
end
