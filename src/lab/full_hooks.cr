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
  @semantic_type_ids = {} of UInt64 => Int32
  @semantic_types = [] of Crystal::Type
  @definition_ids = {} of Tuple(Int32, Int32, Bool) => Int32

  def semantic_type_id(type : Crystal::Type) : Int32
    type = type.instance_type
    @semantic_type_ids[type.object_id]? || begin
      if @semantic_types.size >= MAX_NODES
        bundle.truncated = true
        return 0
      end
      n = @semantic_types.size + 1
      @semantic_type_ids[type.object_id] = n
      @semantic_types << type
      kind = case type
             when Crystal::Program   then "program"
             when Crystal::ClassType then type.struct? ? "struct" : "class"
             else                         type.module? ? "module" : type.type_desc
             end
      name = silence { type.to_s }
      bundle.semantic_types << SemanticTypeInfo.new(n, name, kind)
      n
    end
  end

  def declaration(action : String, node : Crystal::ASTNode, type : Crystal::Type,
                  related : Crystal::Type? = nil, definition_id = 0, implicit = false) : Nil
    return unless active? && user_node?(node)
    return if id(node) == 0
    type_id = semantic_type_id(type)
    related_id = related ? semantic_type_id(related) : 0
    return if type_id == 0 || (related && related_id == 0)
    count = bundle.events.size
    event("declaration", node, "Crystal::TopLevelVisitor", after: silence { type.instance_type.to_s })
    return if bundle.events.size == count
    e = bundle.events.last
    e.declaration_action = action
    e.type_id = type_id
    e.related_type_id = related_id
    e.definition_id = definition_id
    e.implicit = implicit
    if node.location.try(&.macro_location)
      @stack.reverse_each do |frame|
        if frame[0] > 0 && @retained[frame[0] - 1]?.is_a?(Crystal::Call)
          e.origin_id = frame[0]
          break
        end
      end
    end
  end

  def declare_type(node : Crystal::ASTNode, type : Crystal::Type, scope : Crystal::Type, created : Bool) : Nil
    declaration(created ? "type_create" : "type_reopen", node, type, scope)
  end

  def declare_inheritance(node : Crystal::ClassDef, type : Crystal::Type, superclass : Crystal::Type?) : Nil
    declaration("inherit", node, type, superclass, implicit: node.superclass.nil?) if superclass
  end

  def declare_include(node : Crystal::ASTNode, owner : Crystal::Type, type : Crystal::Type, kind) : Nil
    declaration(kind.extended? ? "extend" : "include", node, owner, type)
  end

  def declare_method(node : Crystal::Def, owner : Crystal::Type, previous : Crystal::Def?) : Nil
    return unless active? && user_node?(node)
    n = id(node)
    owner_id = semantic_type_id(owner)
    return if n == 0 || owner_id == 0
    key = {n, owner_id, owner.metaclass?}
    definition_id = @definition_ids[key]? || begin
      if bundle.definitions.size >= MAX_NODES
        bundle.truncated = true
        return
      end
      signature = silence do
        args = node.args.map_with_index do |arg, index|
          "#{index == node.splat_index ? "*" : ""}#{arg}"
        end
        if arg = node.double_splat
          args << "**#{arg}"
        end
        if arg = node.block_arg
          args << "&#{arg}"
        end
        "#{node.name}(#{args.join(", ")})#{node.return_type.try { |restriction| " : #{restriction}" }}"
      end
      new_id = bundle.definitions.size + 1
      bundle.definitions << DefinitionInfo.new(new_id, owner_id, n, node.name, signature, owner.metaclass?)
      @definition_ids[key] = new_id
      new_id
    end
    previous_id = if previous && (previous_node = @objects[previous.object_id]?)
                    @definition_ids[{previous_node, owner_id, owner.metaclass?}]? || 0
                  else
                    0
                  end
    count = bundle.events.size
    declaration("method", node, owner, definition_id: definition_id)
    if bundle.events.size > count
      event = bundle.events.last
      event.replaced_definition_id = previous_id
      event.after = bundle.definitions[definition_id - 1].signature
    end
  end

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
