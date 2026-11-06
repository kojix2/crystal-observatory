# Observe pinned compiler decisions without replacing compiler algorithms.
module ObservatoryScripts::Activities
  MARKER  = "# Observatory activity instrumentation"
  CHANGES = {
    "semantic/restrictions_augmenter.cr" => [
      {
        "        args_hash.delete(target.name)",
        "        if args_hash.has_key?(target.name)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"skip_restriction\", self.class.name, target.name, \"argument_reassigned\", current_def, \"\")\n      {% end %}\n        end\n        args_hash.delete(target.name)",
      },
      {
        "      return false unless @conditional_nest == 0",
        "      if @conditional_nest > 0 && value.is_a?(Var) && args_hash.has_key?(value.name) && (target.is_a?(InstanceVar) || target.is_a?(ClassVar))\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"skip_restriction\", self.class.name, value.name, \"conditional_assignment\", current_def, \"\")\n      {% end %}\n      end\n      return false unless @conditional_nest == 0",
      },
      {
        "      expansion_arg.restriction = restriction.dup",
        "      expansion_arg.restriction = restriction.dup\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(expansion_arg, \"add_restriction\", self.class.name, restriction, \"generated_new\", current_def, \"\")\n      {% end %}",
      },
    ],
    "semantic/type_guess_visitor.cr" => [
      {
        "      if error = @error",
        "      if (target.is_a?(InstanceVar) || target.is_a?(ClassVar)) && !result\n\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(target, \"reject_guess\", self.class.name, @error.try(&.type.to_s) || \"\", \"unresolved_or_forbidden_type\", value, \"\")\n      {% end %}\n      end\n\n      if error = @error",
      },
      {
        "      add_to_initialize_info(target.name)\n\n      value",
        "      add_to_initialize_info(target.name)\n      if info = @initialize_info\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(target, \"register_initializer\", self.class.name, target.name, \"initialize_assignment_checked\", info.def, @found_self ? \"excluded_after_self\" : \"included\")\n      {% end %}\n      end\n\n      value",
      },
      {
        "        @initialize_infos[current_type] << initialize_info",
        "        @initialize_infos[current_type] << initialize_info\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"register_initializer\", self.class.name, initialize_info.instance_vars.try(&.join(\", \")) || \"\", \"initialize_assignment_set\", nil, \"\")\n      {% end %}",
      },
    ],
    "semantic/instance_vars_initializer_visitor.cr" => [
      {
        "      initializers << Initializer.new(current_type, target, value, MetaVars.new)",
        "      initializers << Initializer.new(current_type, target, value, MetaVars.new)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(target, \"register_initializer\", self.class.name, current_type, \"collected\", value, \"\")\n      {% end %}",
      },
      {
        "      next if scope.is_a?(GenericType)",
        "      if scope.is_a?(GenericType)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(i.target, \"register_initializer\", self.class.name, scope, \"generic_deferred\", value, \"\")\n      {% end %}\n      end\n      next if scope.is_a?(GenericType)",
      },
      {
        "          scope_initializer.value = casted_value",
        "          scope_initializer.value = casted_value\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(i.target, \"autocast\", self.class.name, casted_value.type, \"declared_type\", casted_value, \"\")\n      {% end %}",
      },
      {
        "        value.accept ivar_visitor\n      end",
        "        value.accept ivar_visitor\n      end\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(i.target, \"assign_type\", self.class.name, value.type?, \"initializer_typed\", value, \"\")\n      {% end %}",
      },
      {
        "scope.is_a?(GenericType) ? nil : i.meta_vars)\n    end",
        "scope.is_a?(GenericType) ? nil : i.meta_vars)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(i.target, \"register_initializer\", self.class.name, scope, \"registered\", i.value, \"\")\n      {% end %}\n    end",
      },
    ],
    "semantic/class_vars_initializer_visitor.cr" => [
      {
        "      cvars[target.name] = {node.as(ASTNode), value}",
        "      cvars[target.name] = {node.as(ASTNode), value}\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"register_initializer\", self.class.name, owner, \"last_initializer_wins\", value, \"\")\n      {% end %}",
      },
      {
        "          node_to_discard.discarded = true\n        end",
        "          node_to_discard.discarded = true\n        end\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node_to_discard, \"discard_initializer\", self.class.name, owner, \"replaced_by_later_initializer\", node, \"\")\n      {% end %}",
      },
      {
        "        self.class_var_initializers << initializer",
        "        self.class_var_initializers << initializer\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"assign_type\", \"Crystal::ClassVarsInitializerVisitor\", node.type?, \"initializer_typed\", nil, name)\n      {% end %}",
      },
      {
        "              node = initializer.node = casted_value",
        "              node = initializer.node = casted_value\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"autocast\", \"Crystal::ClassVarsInitializerVisitor\", node.type?, \"declared_type\", nil, \"\")\n      {% end %}",
      },
      {
        "        main_visitor = MainVisitor.new(self, meta_vars: meta_vars)",
        "        main_visitor = MainVisitor.new(self, meta_vars: meta_vars)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"register_initializer\", \"Crystal::ClassVarsInitializerVisitor\", owner, \"typing_order\", nil, node.simple_literal? ? \"simple_literal_first\" : \"after_simple_literals\")\n      {% end %}",
      },
    ],
    "semantic/fix_missing_types.cr" => [
      {
        "      node.def.type = @program.no_return",
        "      node.def.type = @program.no_return\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.fixed_type(node.def, \"untyped_proc_body\", node)\n      {% end %}",
      },
      {
        "      node.type = node.call.type = @program.proc_of(arg_types)",
        "      node.type = node.call.type = @program.proc_of(arg_types)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.fixed_type(node, \"proc_pointer_from_arguments\", node.call)\n      {% end %}\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.fixed_type(node.call, \"proc_pointer_from_arguments\", node)\n      {% end %}",
      },
      {
        "      block.type = @program.no_return",
        "      block.type = @program.no_return\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.fixed_type(block, \"unused_or_no_return_block\", node)\n      {% end %}",
      },
      {
        "        target_def.type = @program.no_return unless target_def.type?",
        "        unless target_def.type?\n          target_def.type = @program.no_return\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.fixed_type(target_def, \"untyped_target_def\", node)\n      {% end %}\n        end",
      },
    ],
    "semantic/type_declaration_visitor.cr" => [
      {
        "    owner_vars[var.name] = type_decl",
        "    owner_vars[var.name] = type_decl\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"declare_var\", self.class.name, var_type, \"instance_variable\", var, \"\#{owner}::\#{var.name}\")\n      {% end %}",
      },
      {
        "    owner_vars[var.name] = TypeDeclarationWithLocation.new(var_type.virtual_type, node.location.not_nil!, uninitialized, nil)",
        "    owner_vars[var.name] = TypeDeclarationWithLocation.new(var_type.virtual_type, node.location.not_nil!, uninitialized, nil)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"declare_var\", self.class.name, var_type, \"class_variable\", var, \"\#{owner}::\#{var.name}\")\n      {% end %}",
      },
      {
        "    add_external external",
        "    add_external external\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"declare_fun\", self.class.name, external, \"external_signature_registered\", nil, \"\")\n      {% end %}",
      },
      {
        "    declare_c_struct_or_union_field(type, field_name, ivar, node.location)",
        "    declare_c_struct_or_union_field(type, field_name, ivar, node.location)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"declare_var\", self.class.name, field_type, \"c_field_registered\", nil, \"\#{type}::\#{field_name}\")\n      {% end %}",
      },
      {
        "    type.add_def getter\n\n    false",
        "    type.add_def getter\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"declare_var\", self.class.name, var_type, \"external_variable\", nil, \"\#{type}::\#{node.name}\")\n      {% end %}\n\n    false",
      },
    ],
    "semantic/main_visitor.cr" => [
      {
        "        @vars[name] = filtered_var",
        "        @vars[name] = filtered_var\n        {% if flag?(:lab_full) %}\n          Observatory.recorder.try do |rec|\n            if site = rec.current_node\n              rec.observe(site, \"narrow_type\", self.class.name, filtered_var.type?, \"type_filter\", detail: name, before: rec.type_name(existing_var))\n            end\n          end\n        {% end %}",
      },
      {
        "      @vars[var_name] = simple_var\n\n      check_exception_handler_vars",
        "      @vars[var_name] = simple_var\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"assign_type\", self.class.name, simple_var.type?, \"local_assignment\", target, \"\#{var_name}; cumulative=\#{meta_var.type?}; scope=\#{@scope || current_type}\")\n      {% end %}\n\n      check_exception_handler_vars",
      },
      {
        "          program.const_initializers << type",
        "          program.const_initializers << type\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"assign_type\", self.class.name, type.value.type?, \"constant_initialized\", type.value, \"\")\n      {% end %}",
      },
    ],
    "semantic/call.cr" => [
      {
        "            typed_def.body.accept visitor",
        "\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(self, \"instantiate_def\", \"Crystal::MainVisitor\", typed_def, \"begin_instantiation\", typed_def, \"\")\n      {% end %}\n            typed_def.body.accept visitor\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(self, \"instantiate_def\", \"Crystal::MainVisitor\", typed_def.type?, \"end_instantiation\", typed_def, \"\")\n      {% end %}",
      },
    ],
    "macros/interpreter.cr" => [
      {
        "      new(program, scope, path_lookup, a_macro.location, vars, call.block, a_def, in_macro, call)",
        "      vars.each do |name, value|\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(call, \"bind_macro_var\", \"Crystal::MacroInterpreter\", value, \"macro_argument\", value, name)\n      {% end %}\n      end\n      new(program, scope, path_lookup, a_macro.location, vars, call.block, a_def, in_macro, call)",
      },
      {
        "      body.accept self\n\n      false",
        "\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"macro_branch\", self.class.name, body, \"evaluated_condition\", node.cond, @last.truthy? ? \"then\" : \"else\")\n      {% end %}\n      body.accept self\n\n      false",
      },
      {
        "        @vars[target.name] = @last",
        "        @vars[target.name] = @last\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"bind_macro_var\", self.class.name, @last, \"macro_assignment\", target, \"\")\n      {% end %}",
      },
      {
        "          node.body.accept self\n        end",
        "\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"macro_iteration\", self.class.name, index, \"range_iteration\", element, \"\")\n      {% end %}\n          node.body.accept self\n        end",
      },
      {
        "        node.body.accept self\n      end\n\n      @vars.delete element_var.name",
        "\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"macro_iteration\", self.class.name, index, \"array_iteration\", @vars[element_var.name], \"\")\n      {% end %}\n        node.body.accept self\n      end\n\n      @vars.delete element_var.name",
      },
      {
        "        node.body.accept self\n      end\n\n      @vars.delete key_var.name",
        "\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"macro_iteration\", self.class.name, i, \"hash_iteration\", key, \"\")\n      {% end %}\n        node.body.accept self\n      end\n\n      @vars.delete key_var.name",
      },
    ],
    "codegen/codegen.cr" => [
      {
        "          @codegen.accept node\n        end",
        "          @codegen.accept node\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"select_well_known_fun\", self.class.name, node.name, \"runtime_required\", nil, \"\")\n      {% end %}\n        else\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"select_well_known_fun\", self.class.name, node.name, \"not_runtime_required\", nil, \"\")\n      {% end %}\n        end",
      },
    ],
    "semantic/normalizer.cr" => [
      {
        "      node.expressions.each do |exp|",
        "      node.expressions.each_with_index do |exp, index|",
      },
      {
        "        break if @dead_code",
        "        if @dead_code\n          node.expressions.skip(index + 1).each do |removed|\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"remove_dead_code\", self.class.name, removed, \"after_terminator\", removed, \"\")\n      {% end %}\n          end\n          break\n        end",
      },
      {
        "          temp_assign = Assign.new(temp_var.clone, middle).at(middle)",
        "          temp_assign = Assign.new(temp_var.clone, middle).at(middle)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"rewrite\", self.class.name, temp_var, \"comparison_temporary\", temp_assign, \"\")\n      {% end %}",
      },
    ],
    "semantic/cleanup_transformer.cr" => [
      {
        "        break if flatten_collect(new_exp, exps)",
        "        if flatten_collect(new_exp, exps)\n          node.expressions.skip(i + 1).each do |removed|\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"remove_dead_code\", self.class.name, removed, \"after_no_return_or_terminator\", removed, \"\")\n      {% end %}\n          end\n          break\n        end",
      },
    ],
    "codegen/fun.cr" => [
      {
        "      args = codegen_fun_signature(mangled_name, target_def, self_type, is_fun_literal, is_closure)",
        "      args = codegen_fun_signature(mangled_name, target_def, self_type, is_fun_literal, is_closure)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.activity(\"begin_function\", target_def, self.class.name, after: mangled_name, reason: \"function_signature_created\", llvm_function: mangled_name)\n      {% end %}",
      },
    ],
    "semantic/top_level_visitor.cr" => [
      {
        "    scope.types[name] = const",
        "    scope.types[name] = const\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"declare_const\", self.class.name, name, \"constant_registered\", value, \"\#{scope}\")\n      {% end %}",
      },
      {
        "        new_expansions[node] = new_method",
        "        new_expansions[node] = new_method\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"register_initializer\", self.class.name, new_method, \"generated_new\", new_method, \"\")\n      {% end %}",
      },
      {
        "      target.add_macro node",
        "      target.add_macro node\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.observe(node, \"declare_fun\", self.class.name, node.name, \"macro_registered\", nil, \"\")\n      {% end %}",
      },
    ],
  }

  def self.instrument(source : String, replacements : Array(Tuple(String, String)), path : String) : String
    if source.includes?(MARKER)
      raise "Activity instrumentation expected one source match in #{path}: already instrumented"
    end
    replacements.each do |before, after|
      unless source.split(before).size == 2
        raise "Activity instrumentation expected one source match in #{path}: #{before.inspect}"
      end
      source = source.sub(before, after)
    end
    MARKER + "\n" + source
  end

  def self.apply(tree : Path)
    # Validate every replacement before writing any of the source files.
    outputs = {} of Path => String
    CHANGES.each do |relative, replacements|
      path = tree / "compiler/crystal" / relative
      outputs[path] = instrument(File.read(path), replacements, relative)
    end
    outputs.each { |path, source| File.write(path, source) }
  end
end
