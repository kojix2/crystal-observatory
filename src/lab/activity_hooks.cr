class Crystal::TypeDeclarationVisitor
  def visit(node : Crystal::TypeDeclaration)
    previous_def
  rescue ex : Crystal::CodeError
    Observatory.recorder.try &.activity("declare_var", node, self.class.name,
      reason: "resolution_failed", detail: ex.message || ex.class.name)
    raise ex
  end
end

class Observatory::Recorder
  def enable_activities
    cover("RestrictionsAugmenter", ["Assign", "Arg"], ["add_restriction", "skip_restriction"])
    cover("TypeGuessVisitor", ["InstanceVar", "ClassVar", "Def"], ["guess_type", "merge_guess", "reject_guess", "register_initializer"])
    cover("HasSelfVisitor", ["*"], ["check_self"])
    cover("InstanceVarsInitializerVisitor", ["InstanceVar"], ["register_initializer", "autocast", "assign_type"])
    cover("ClassVarsInitializerVisitor", ["Assign", "TypeDeclaration"], ["register_initializer", "discard_initializer"])
    cover("ClassVarsInitializerVisitor", ["*"], ["assign_type", "autocast"])
    cover("TypeDeclarationVisitor", ["TypeDeclaration", "UninitializedVar", "ExternalVar"], ["declare_var"])
    cover("TypeDeclarationVisitor", ["FunDef"], ["declare_fun"])
    cover("FixMissingTypes", ["Def", "Block", "ProcPointer", "Call"], ["fix_missing_type"])
    cover("MainVisitor", ["Call", "Path", "Var", "Assign", "If", "While"], ["resolve_target", "instantiate_def", "assign_type", "narrow_type"])
    cover("Normalizer", ["*"], ["rewrite"])
    cover("Normalizer", ["Expressions"], ["remove_dead_code"])
    cover("CleanupTransformer", ["*"], ["rewrite", "replace_untyped"])
    cover("CleanupTransformer", ["If"], ["simplify_condition"])
    cover("CleanupTransformer", ["Expressions"], ["remove_dead_code"])
    cover("MacroInterpreter", ["MacroExpression"], ["eval_macro_expression", "emit_macro_source"])
    cover("MacroInterpreter", ["MacroIf"], ["macro_branch"])
    cover("MacroInterpreter", ["MacroFor"], ["macro_iteration", "bind_macro_var"])
    cover("MacroInterpreter", ["Call", "Assign"], ["bind_macro_var", "emit_macro_source"])
    cover("ToSVisitor", ["*"], ["serialize_source"])
    cover("CodeGenVisitor", ["*"], ["emit_instructions"])
    cover("CodeGenVisitor", ["Def"], ["begin_function"])
    cover("CodeGenVisitor::CodegenWellKnownFunctions", ["FunDef"], ["select_well_known_fun"])
    cover("TopLevelVisitor", ["ClassDef", "ModuleDef", "Def", "Macro", "Include", "Extend"], ["declare_type", "declare_fun", "register_initializer"])
    cover("TopLevelVisitor", ["Assign", "TypeDeclaration"], ["declare_const"])
  end

  def observe(node : Crystal::ASTNode, activity : String, visitor : String, value,
              reason = "", related : Crystal::ASTNode? = nil, detail = "", before = "")
    return unless active? && user_node?(node)
    activity(activity, node, visitor, before, silence { value.to_s }, reason, related, detail)
  end

  def fixed_type(node : Crystal::ASTNode, reason : String, related : Crystal::ASTNode? = nil)
    return unless active? && user_node?(node)
    activity("fix_missing_type", node, "Crystal::FixMissingTypes", after: type_name(node), reason: reason, related: related)
    event("type", node, "Crystal::FixMissingTypes", after: type_name(node), detail: reason)
  end
end

class Crystal::RestrictionsAugmenter
  private def augment(target, value, current_type, current_def, arg, type)
    before = arg.restriction
    result = previous_def
    if restriction = arg.restriction
      unless before
        Observatory.recorder.try do |rec|
          rec.observe(arg, "add_restriction", self.class.name, restriction, "unconditional_assignment", rec.current_node,
            "#{current_def.name}(#{arg.name}); owner=#{rec.silence { current_type.to_s }}")
        end
      end
    end
    result
  end
end

class Crystal::TypeGuessVisitor
  {% for method in ["add_type_info", "add_instance_var_type_info"] %}
    def {{method.id}}(vars, name, type{% if method == "add_instance_var_type_info" %} : Type{% end %}, node)
      rec = Observatory.recorder
      before = rec && rec.active? ? rec.silence { vars[name]?.try(&.type.to_s) || "" } : ""
      result = previous_def
      rec.try &.observe(node, before.empty? ? "guess_type" : "merge_guess", self.class.name, vars[name].type,
        "assignment_candidate", detail: "#{name}; owner=#{rec.try &.silence { current_type.to_s }}", before: before)
      result
    end
  {% end %}

  def check_has_self(node)
    result = previous_def
    unless node.is_a?(Crystal::Var)
      Observatory.recorder.try do |rec|
        rec.activity("check_self", node, "Crystal::HasSelfVisitor", after: @has_self_visitor.has_self.to_s,
          reason: @has_self_visitor.has_self ? "self_detected" : "self_not_detected",
          parent_visitor: rec.current_visitor)
      end
    end
    result
  end
end

class Crystal::HasSelfVisitor
  def visit(node : Crystal::Call)
    result = previous_def
    if node.obj.is_a?(Crystal::Var) && node.obj.as(Crystal::Var).name == "self" && node.name == "class" && node.args.empty?
      Observatory.recorder.try do |rec|
        rec.activity("check_self", node, self.class.name, after: "false", reason: "self_class_excluded",
          parent_visitor: rec.parent_visitor(self.class.name))
      end
    end
    result
  end
end

class Crystal::MacroInterpreter
  def visit(node : Crystal::MacroExpression)
    result = previous_def
    Observatory.recorder.try do |rec|
      rec.observe(node, "eval_macro_expression", self.class.name, @last, "interpreted_expression", node.exp)
    end

    result
  end

  def to_s : String
    result = previous_def
    if call = @call
      Observatory.recorder.try &.observe(call, "emit_macro_source", self.class.name, result, "expansion_source")
    end
    result
  end
end

class Crystal::CleanupTransformer
  def untyped_expression(node, msg = nil)
    result = previous_def
    Observatory.recorder.try &.observe(node, "replace_untyped", self.class.name, result, "missing_type", result,
      msg || "", before: Observatory.recorder.try(&.text(node)) || "")
    result
  end

  def transform(node : Crystal::If)
    result = previous_def
    if node.truthy? || node.falsey?
      Observatory.recorder.try &.observe(node, "simplify_condition", self.class.name, result,
        node.truthy? ? "always_true" : "always_false", node.truthy? ? node.else : node.then)
    end
    result
  end
end
