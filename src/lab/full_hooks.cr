require "./hooks"

class Crystal::ASTNode
  # These must remain distinct overloads to preserve upstream previous_def dispatch.
  {% for type in [Crystal::Type, Nil] %}
    def set_type(type : {{type}})
      rec = Observatory.recorder
      before = rec.try(&.before_type_change(self)) || ""
      result = previous_def
      rec.try &.type_changed(self, before)
      result
    end
  {% end %}

  def add_observer(observer)
    result = previous_def
    Observatory.recorder.try &.dependency(self, observer)
    result
  end

  def remove_observer(observer)
    result = previous_def
    Observatory.recorder.try &.dependency(self, observer, true)
    result
  end
end

class Crystal::ProgressTracker
  def stage(name, &)
    rec = Observatory.recorder
    old_phase = rec.try &.phase
    if rec
      rec.phase = name
      rec.event("phase_enter", detail: name)
    end
    result = previous_def(name) { yield }
    if rec
      if result.is_a?(Crystal::ASTNode) && (name == "Parse" || name == "Semantic (main)")
        rec.root = result
      end
      rec.event("phase_leave", detail: name)
      rec.snapshot(name)
    end
    result
  ensure
    rec.phase = old_phase if rec && old_phase
  end
end

class Observatory::Recorder
  def before_type_change(node : Crystal::ASTNode) : String
    return "" unless active? && user_node?(node)
    id(node)
    type_name(node)
  end

  def expansion(node : Crystal::ASTNode, value : Crystal::ASTNode?, visitor : String)
    return unless value && active? && user_node?(node)
    event("expand", node, visitor, text(node), text(value), value)
    snapshot("Expansion ##{id(node)}")
  end

  def codegen_position(node : Crystal::ASTNode, visitor : Crystal::CodeGenVisitor)
    return unless active? && user_node?(node)
    block = visitor.builder.insert_block
    return if block.to_unsafe.null?
    function = block.parent
    return unless function
    event("ir", node, visitor.class.name,
      detail: "Builder insertion point after this visit (includes child emission; not exclusive instruction attribution)",
      after: block.instructions.to_a.last(6).map(&.to_s).join("\n"))
    if e = bundle.events.last?
      if e.kind == "ir" && e.node_id == id(node)
        e.llvm_function = function.name
        e.llvm_block = block.name || ""
      end
    end
  end
end

class Crystal::Compiler
  private def parse(program, source : Source)
    result = previous_def
    Observatory.recorder.try do |rec|
      rec.root = result
      rec.snapshot("Parsed AST", result)
    end
    result
  end
end

class Crystal::Call
  def expanded=(value : Crystal::ASTNode?)
    result = previous_def
    Observatory.recorder.try &.expansion(self, value, "Crystal::Call#expanded=")
    result
  end

  def recalculate
    rec = Observatory.recorder
    tracked = rec && rec.active? && rec.user_node?(self)
    before = tracked ? target_defs.try(&.map(&.object_id)) : nil
    result = previous_def
    if tracked && rec && (defs = target_defs) && before != defs.map(&.object_id)
      defs.each do |target|
        signature = "#{target.name}(#{target.args.map { |a| rec.type_name(a) }.join(", ")}) : #{rec.type_name(target)}"
        rec.event("dispatch", self, "Crystal::Call#recalculate", after: signature, related: target,
          detail: "Resolved typed method; one call can have multiple targets for union dispatch")
      end
      rec.snapshot("Resolved call ##{rec.id(self)}")
    end
    result
  end
end

module Crystal::ExpandableNode
  def expanded=(value : Crystal::ASTNode?)
    result = previous_def
    Observatory.recorder.try &.expansion(self, value, "Crystal::ExpandableNode#expanded=")
    result
  end
end

# Break a compile-time inference cycle introduced by observing types from AST
# dispatch (upstream Type#to_s has an inferred return type).
class Crystal::Type
  def to_s(*, generic_args : Bool = true) : String
    previous_def
  end
end
