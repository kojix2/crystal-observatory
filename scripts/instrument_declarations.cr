# Instrument successful top-level operations in the pinned compiler source.
module ObservatoryScripts::Declarations
  CHANGES = [
    {
      "    node.resolved_type = type\n\n    process_annotations(annotations) do",
      "    node.resolved_type = type\n    {% if flag?(:lab_full) %}\n      Observatory.recorder.try do |rec|\n        rec.declare_type(node, type, scope, created_new_type)\n        rec.declare_inheritance(node, type, superclass) if created_new_type\n      end\n    {% end %}\n\n    process_annotations(annotations) do",
    },
    {
      "    scope, name, type = lookup_type_def(node)\n\n    if type\n      type = type.remove_alias\n\n      unless type.module?",
      "    scope, name, type = lookup_type_def(node)\n    created_new_type = type.nil?\n\n    if type\n      type = type.remove_alias\n\n      unless type.module?",
    },
    {
      "    node.resolved_type = type\n\n    attach_doc type, node, annotations\n\n    process_annotations",
      "    node.resolved_type = type\n    {% if flag?(:lab_full) %}\n      Observatory.recorder.try &.declare_type(node, type, scope, created_new_type)\n    {% end %}\n\n    attach_doc type, node, annotations\n\n    process_annotations",
    },
    {
      "    target_type.add_def node\n\n    node.set_type",
      "    previous_definition = target_type.add_def node\n    {% if flag?(:lab_full) %}\n      Observatory.recorder.try &.declare_method(node, target_type, previous_definition)\n    {% end %}\n\n    node.set_type",
    },
    {
      "      current_type.as(ModuleType).include type\n      run_hooks",
      "      current_type.as(ModuleType).include type\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.declare_include(node, current_type, type, kind)\n      {% end %}\n      run_hooks",
    },
  ]

  def self.instrument(source : String) : String
    CHANGES.each do |before, after|
      unless source.split(before).size == 2
        raise "Declaration instrumentation expected one source match: #{before.inspect}"
      end
      source = source.sub(before, after)
    end
    source
  end

  def self.apply(tree : Path)
    path = tree / "compiler/crystal/semantic/top_level_visitor.cr"
    File.write(path, instrument(File.read(path)))
  end
end
