require "compiler/crystal/syntax"
require "./schema"

module Observatory
  # Each analysis runs in a fresh WASM instance inside a Web Worker.
  # Retaining AST objects makes session-local IDs stable despite GC.
  class Recorder
    MAX_EVENTS = 40_000
    MAX_NODES  =  8_000
    property bundle : Bundle
    property phase = "Parse"
    property root : Crystal::ASTNode? = nil
    property dispatch_node : Crystal::ASTNode? = nil
    @muted = 0
    @objects = {} of UInt64 => Int32
    @retained = [] of Crystal::ASTNode
    @stack = [] of Tuple(Int32, String)
    @token_keys = Set(String).new

    def initialize(source : String, filename : String, compiler_version : String)
      @bundle = Bundle.new(source, filename)
      @bundle.compiler_version = compiler_version
    end

    def silence(&)
      @muted += 1
      yield
    ensure
      @muted -= 1
    end

    def active?
      @muted == 0
    end

    def user_node?(node : Crystal::ASTNode)
      {% if flag?(:lab_full) %}
        return node.filename == bundle.filename if node.is_a?(Crystal::FileNode)
        return false if node.is_a?(Crystal::Require) && node.string == bundle.prelude
      {% end %}
      return true if @objects.has_key?(node.object_id)
      location = node.location
      return false unless location
      location.original_filename == bundle.filename || location.macro_location.try(&.original_filename) == bundle.filename
    end

    def text(node : Crystal::ASTNode) : String
      silence { node.to_s[0, 1000] }
    end

    def type_name(node : Crystal::ASTNode) : String
      {% if flag?(:lab_full) %}
        silence { node.type?.try(&.to_s) || "" }
      {% else %}
        ""
      {% end %}
    end

    def id(node : Crystal::ASTNode) : Int32
      @objects[node.object_id]? || begin
        if @retained.size >= MAX_NODES
          bundle.truncated = true
          return 0
        end
        n = @retained.size + 1
        @objects[node.object_id] = n
        @retained << node
        bundle.nodes << info(node, n)
        n
      end
    end

    def info(node : Crystal::ASTNode, n : Int32 = id(node)) : NodeInfo
      code = text(node)
      value = NodeInfo.new(n, node.class.name.split("::").last, code.lines.first?.to_s[0, 90], code)
      if loc = node.location
        mapped = loc.expanded_location || loc
        value.line = mapped.line_number
        value.column = mapped.column_number
        value.filename = mapped.filename.to_s
      end
      if loc = node.end_location
        mapped = loc.expanded_location || loc
        value.end_line = mapped.line_number
        value.end_column = mapped.column_number
      end
      value.inferred_type = type_name(node)
      value
    end

    def event(kind : String, node : Crystal::ASTNode? = nil, visitor = "", before = "", after = "", related : Crystal::ASTNode? = nil, detail = "")
      return unless active?
      if bundle.events.size >= MAX_EVENTS
        bundle.truncated = true
        return
      end
      e = Event.new(kind, phase)
      e.index = bundle.events.size
      e.visitor = visitor
      e.node_id = node ? id(node) : 0
      e.related_id = related ? id(related) : 0
      e.parent_id = @stack.last?.try(&.[0]) || 0
      e.depth = @stack.size
      e.before, e.after, e.detail = before, after, detail
      bundle.events << e
    end

    def activity(activity : String, node : Crystal::ASTNode, visitor : String,
                 before = "", after = "", reason = "", related : Crystal::ASTNode? = nil,
                 detail = "", parent_visitor = "", llvm_function = "", llvm_block = "")
      return unless active? && user_node?(node)
      return if id(node) == 0
      return if related && id(related) == 0
      count = bundle.events.size
      event("activity", node, visitor, before, after, related, detail)
      return if bundle.events.size == count
      e = bundle.events.last
      e.activity, e.reason = activity, reason
      e.parent_visitor = parent_visitor
      e.llvm_function, e.llvm_block = llvm_function, llvm_block
    end

    def current_node : Crystal::ASTNode?
      dispatch_node
    end

    def current_visitor : String
      @stack.last?.try(&.[1]) || ""
    end

    def nested_visit?(visitor : String) : Bool
      @stack.size > 1 && @stack[-2][1] == visitor
    end

    def parent_visitor(visitor : String) : String
      @stack.reverse_each do |frame|
        return frame[1] unless frame[1] == visitor
      end
      ""
    end

    def cover(visitor : String, nodes : Array(String), activities : Array(String))
      bundle.activity_coverage << ActivityCoverage.new("Crystal::#{visitor}", nodes, activities)
    end

    def enter(node : Crystal::ASTNode, visitor : String, kind = "visit_enter") : Bool
      return false unless active? && user_node?(node)
      event(kind, node, visitor, after: type_name(node))
      @stack << {id(node), visitor}
      true
    end

    def leave(node : Crystal::ASTNode, visitor : String, kind = "visit_leave")
      @stack.pop?
      event(kind, node, visitor, after: type_name(node))
    end

    def type_changed(node : Crystal::ASTNode, before : String)
      return unless active? && user_node?(node)
      after = type_name(node)
      unless before == after
        visitor = current_visitor
        visitor = "binding" if visitor.empty?
        event("type", node, visitor, before, after)
        activity("assign_type", node, visitor, before, after, "set_type")
      end
    end

    def dependency(dependency : Crystal::ASTNode, observer : Crystal::ASTNode, remove = false)
      return unless active? && (user_node?(dependency) || user_node?(observer))
      event(remove ? "unbind" : "bind", observer, "ASTNode", related: dependency,
        detail: "observer depends on related_id; types propagate dependency → observer")
    end

    def token(t : Crystal::Token, mode : String)
      return unless active? && phase == "Parse" && t.filename.to_s == bundle.filename
      key = "#{t.line_number}:#{t.column_number}:#{t.type}:#{t.value}"
      return unless @token_keys.add?(key)
      return if bundle.tokens.size >= MAX_EVENTS
      bundle.tokens << TokenInfo.new(t.type.to_s, t.value.to_s, t.line_number, t.column_number,
        mode, t.number_kind.to_s, t.delimiter_state.kind.to_s)
    end

    def snapshot(name : String, node : Crystal::ASTNode? = @root)
      return unless node
      silence do
        snap = Snapshot.new(name, bundle.events.size)
        capture = Capture.new(self, snap)
        capture.walk(node)
        bundle.snapshots << snap
      end
    end

    class Capture
      @seen = Set(Int32).new

      def initialize(@rec : Recorder, @snapshot : Snapshot)
      end

      def walk(node : Crystal::ASTNode, parent : NodeInfo? = nil, relation = "child")
        {% if flag?(:lab_full) %}
          return if node.is_a?(Crystal::FileNode) && node.filename != @rec.bundle.filename
        {% end %}
        # Location-free containers are needed to reach the main source; skip
        # unrelated stdlib subtrees without including the entire prelude.
        if !@rec.user_node?(node) && node.location
          return
        end
        return if parent && node.is_a?(Crystal::Nop) && !node.location
        {% if flag?(:lab_full) %}
          return if parent && node.is_a?(Crystal::Require) && node.string == @rec.bundle.prelude
        {% end %}
        n = @rec.id(node)
        return if n == 0
        if parent
          case relation
          when "expanded" then parent.expanded = n
          when "target"   then parent.targets << n
          when "hook"     then parent.hook_expansions << n
          else                 parent.children << n
          end
        else
          @snapshot.roots << n
        end
        return unless @seen.add?(n)
        value = @rec.info(node, n)
        @snapshot.nodes << value
        node.accept_children(Children.new(self, value))
        {% if flag?(:lab_full) %}
          if node.is_a?(Crystal::ExpandableNode)
            node.expanded.try { |expanded| walk(expanded, value, "expanded") }
          end
          if node.is_a?(Crystal::Call)
            node.target_defs.try &.each { |target| walk(target, value, "target") }
            node.expanded.try { |expanded| walk(expanded, value, "expanded") }
          end
          if node.is_a?(Crystal::HookExpansionsContainer)
            node.hook_expansions.try &.each { |expansion| walk(expansion, value, "hook") }
          end
        {% end %}
      end

      class Children < Crystal::Visitor
        def visit(node)
          false
        end

        def initialize(@capture : Capture, @parent : NodeInfo)
        end

        def visit_any(node)
          @capture.walk(node, @parent)
          false
        end
      end
    end
  end

  class_property recorder : Recorder?
end
