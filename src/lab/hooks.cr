require "./recorder"

# Decorate the real dispatch boundary; previous_def preserves Crystal's
# visit_any / visit / accept_children / end_visit semantics, including pruning.
class Crystal::ASTNode
  def accept(visitor)
    rec = Observatory.recorder
    old_dispatch = rec.try &.dispatch_node
    rec.dispatch_node = self if rec
    entered = rec.try &.enter(self, visitor.class.name)
    {% if flag?(:lab_full) %}
      ir_before = entered && rec && visitor.is_a?(Crystal::CodeGenVisitor) ? rec.codegen_before(visitor) : nil
    {% end %}
    result = previous_def
    if entered && rec && visitor.is_a?(Crystal::ToSVisitor) && !rec.nested_visit?(visitor.class.name)
      # Only report the root of each serialization, not every formatting step.
      rec.activity("serialize_source", self, visitor.class.name, reason: "compiler_serialization",
        parent_visitor: rec.parent_visitor(visitor.class.name))
    end
    {% if flag?(:lab_full) %}
      if entered && rec && visitor.is_a?(Crystal::CodeGenVisitor)
        rec.codegen_position(self, visitor, ir_before)
      end
    {% end %}
    result
  ensure
    rec.try &.leave(self, visitor.class.name) if entered
    rec.dispatch_node = old_dispatch if rec
  end

  def transform(transformer)
    rec = Observatory.recorder
    old_dispatch = rec.try &.dispatch_node
    rec.dispatch_node = self if rec
    entered = rec.try &.enter(self, transformer.class.name, "transform_enter")
    before = entered ? rec.not_nil!.text(self) : ""
    result = previous_def
    if entered && rec
      after = result ? rec.text(result) : "∅"
      if before != after || !result.same?(self)
        rec.event("rewrite", self, transformer.class.name, before, after, result)
        rec.activity("rewrite", self, transformer.class.name, before, after,
          "transform_#{self.class.name.split("::").last}", result)
      end
    end
    result
  ensure
    rec.try &.leave(self, transformer.class.name, "transform_leave") if entered
    rec.dispatch_node = old_dispatch if rec
  end
end

class Crystal::Lexer
  def next_token
    token = previous_def
    Observatory.recorder.try &.token(@token, "normal")
    token
  end

  def next_string_token(delimiter_state)
    token = previous_def
    Observatory.recorder.try &.token(@token, "string")
    token
  end

  def next_string_token_noescape(delimiter_state)
    token = previous_def
    token
  end

  def next_macro_token(macro_state, skip_whitespace)
    token = previous_def
    Observatory.recorder.try &.token(@token, "macro")
    token
  end

  def next_string_array_token_noescape(delimiter_state)
    token = previous_def
    Observatory.recorder.try &.token(@token, "string array")
    token
  end
end
