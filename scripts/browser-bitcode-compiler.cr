require "log"
require "compiler/requires"

# The build pipeline runs opt/llc itself. Upstream cross_compile also emits an
# unused WASM object, retaining the entire compiler during native LLVM emission.
class Crystal::Compiler
  private def cross_compile(program, units, output_filename)
    raise "Browser compiler build expects --emit llvm-bc only" unless @emit_targets == EmitTarget::LLVM_BC
    @progress_tracker.stage("Codegen (browser bitcode)") do
      unit = units.first
      optimize unit.llvm_mod, target_machine unless @optimization_mode.o0?
      unit.emit(@emit_targets, emit_base_filename || output_filename, from_cache: false)
    end
  end
end

Log.setup_from_env(default_level: :warn, default_sources: "crystal.*")
{% if Fiber.has_constant?(:ExecutionContext) %}
  Fiber::ExecutionContext.default.resize(Fiber::ExecutionContext.default_workers_count)
{% end %}
Crystal::Command.run
