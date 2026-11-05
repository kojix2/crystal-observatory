require "./hooks"

module Observatory
  # This is explicitly an inspection visitor, not a semantic compiler pass.
  class SyntaxWalkVisitor < Crystal::Visitor
    def visit(node)
      true
    end
  end

  def self.syntax(source : String, filename = "input.cr") : Bundle
    raise "Source exceeds 256 KiB" if source.bytesize > 262_144
    rec = Recorder.new(source, filename, {{ read_file("#{__DIR__}/../../vendor/crystal-src/VERSION").strip }})
    self.recorder = rec
    begin
      parser = Crystal::Parser.new(source)
      parser.filename = filename
      node = parser.parse
      rec.root = node
      rec.snapshot("Parsed AST")
      rec.phase = "Syntax walk (inspection)"
      rec.event("phase_enter", detail: rec.phase)
      node.accept(SyntaxWalkVisitor.new)
      rec.event("phase_leave", detail: rec.phase)
      rec.snapshot("Syntax walk (inspection)")
    rescue ex
      rec.bundle.errors << (ex.message || ex.class.name)
    ensure
      self.recorder = nil
    end
    rec.bundle
  end
end
