"""Observe pinned compiler decisions without replacing compiler algorithms."""
from pathlib import Path


def hook(node, activity, value='""', reason="", related="nil", detail='""', visitor="self.class.name"):
    return (
        "\n      {% if flag?(:lab_full) %}\n"
        f'        Observatory.recorder.try &.observe({node}, "{activity}", {visitor}, {value}, '
        f'"{reason}", {related}, {detail})\n'
        "      {% end %}"
    )


def fixed(node, reason, related="nil"):
    return (
        "\n      {% if flag?(:lab_full) %}\n"
        f'        Observatory.recorder.try &.fixed_type({node}, "{reason}", {related})\n'
        "      {% end %}"
    )


def changes():
    return {
        "semantic/restrictions_augmenter.cr": [
            ("        args_hash.delete(target.name)",
             "        if args_hash.has_key?(target.name)" + hook("node", "skip_restriction", "target.name", "argument_reassigned", "current_def") + "\n        end\n        args_hash.delete(target.name)"),
            ("      return false unless @conditional_nest == 0",
             '      if @conditional_nest > 0 && value.is_a?(Var) && args_hash.has_key?(value.name) && (target.is_a?(InstanceVar) || target.is_a?(ClassVar))' +
             hook("node", "skip_restriction", "value.name", "conditional_assignment", "current_def") + "\n      end\n      return false unless @conditional_nest == 0"),
            ("      expansion_arg.restriction = restriction.dup",
             "      expansion_arg.restriction = restriction.dup" + hook("expansion_arg", "add_restriction", "restriction", "generated_new", "current_def")),
        ],
        "semantic/type_guess_visitor.cr": [
            ("      if error = @error",
             '      if (target.is_a?(InstanceVar) || target.is_a?(ClassVar)) && !result\n' +
             hook("target", "reject_guess", '@error.try(&.type.to_s) || ""', "unresolved_or_forbidden_type", "value") + "\n      end\n\n      if error = @error"),
            ("      add_to_initialize_info(target.name)\n\n      value",
             "      add_to_initialize_info(target.name)\n      if info = @initialize_info" + hook("target", "register_initializer", "target.name", "initialize_assignment_checked", "info.def", '@found_self ? "excluded_after_self" : "included"') + "\n      end\n\n      value"),
            ("        @initialize_infos[current_type] << initialize_info",
             "        @initialize_infos[current_type] << initialize_info" + hook("node", "register_initializer", 'initialize_info.instance_vars.try(&.join(", ")) || ""', "initialize_assignment_set")),
        ],
        "semantic/instance_vars_initializer_visitor.cr": [
            ("      initializers << Initializer.new(current_type, target, value, MetaVars.new)",
             "      initializers << Initializer.new(current_type, target, value, MetaVars.new)" +
             hook("target", "register_initializer", "current_type", "collected", "value")),
            ("      next if scope.is_a?(GenericType)",
             "      if scope.is_a?(GenericType)" + hook("i.target", "register_initializer", "scope", "generic_deferred", "value") + "\n      end\n      next if scope.is_a?(GenericType)"),
            ("          scope_initializer.value = casted_value",
             "          scope_initializer.value = casted_value" + hook("i.target", "autocast", "casted_value.type", "declared_type", "casted_value")),
            ("        value.accept ivar_visitor\n      end",
             "        value.accept ivar_visitor\n      end" + hook("i.target", "assign_type", "value.type?", "initializer_typed", "value")),
            ("scope.is_a?(GenericType) ? nil : i.meta_vars)\n    end",
             "scope.is_a?(GenericType) ? nil : i.meta_vars)" + hook("i.target", "register_initializer", "scope", "registered", "i.value") + "\n    end"),
        ],
        "semantic/class_vars_initializer_visitor.cr": [
            ("      cvars[target.name] = {node.as(ASTNode), value}",
             "      cvars[target.name] = {node.as(ASTNode), value}" + hook("node", "register_initializer", "owner", "last_initializer_wins", "value")),
            ("          node_to_discard.discarded = true\n        end",
             "          node_to_discard.discarded = true\n        end" + hook("node_to_discard", "discard_initializer", "owner", "replaced_by_later_initializer", "node")),
            ("        self.class_var_initializers << initializer",
             "        self.class_var_initializers << initializer" + hook("node", "assign_type", "node.type?", "initializer_typed", detail='name', visitor='"Crystal::ClassVarsInitializerVisitor"')),
            ("              node = initializer.node = casted_value",
             "              node = initializer.node = casted_value" + hook("node", "autocast", "node.type?", "declared_type", visitor='"Crystal::ClassVarsInitializerVisitor"')),
            ("        main_visitor = MainVisitor.new(self, meta_vars: meta_vars)",
             "        main_visitor = MainVisitor.new(self, meta_vars: meta_vars)" +
             hook("node", "register_initializer", "owner", "typing_order", detail='node.simple_literal? ? "simple_literal_first" : "after_simple_literals"', visitor='"Crystal::ClassVarsInitializerVisitor"')),
        ],
        "semantic/fix_missing_types.cr": [
            ("      node.def.type = @program.no_return", "      node.def.type = @program.no_return" + fixed("node.def", "untyped_proc_body", "node")),
            ("      node.type = node.call.type = @program.proc_of(arg_types)",
             "      node.type = node.call.type = @program.proc_of(arg_types)" + fixed("node", "proc_pointer_from_arguments", "node.call") + fixed("node.call", "proc_pointer_from_arguments", "node")),
            ("      block.type = @program.no_return", "      block.type = @program.no_return" + fixed("block", "unused_or_no_return_block", "node")),
            ("        target_def.type = @program.no_return unless target_def.type?",
             "        unless target_def.type?\n          target_def.type = @program.no_return" + fixed("target_def", "untyped_target_def", "node") + "\n        end"),
        ],
        "semantic/type_declaration_visitor.cr": [
            ("    owner_vars[var.name] = type_decl",
             "    owner_vars[var.name] = type_decl" + hook("node", "declare_var", "var_type", "instance_variable", "var", detail='"#{owner}::#{var.name}"')),
            ("    owner_vars[var.name] = TypeDeclarationWithLocation.new(var_type.virtual_type, node.location.not_nil!, uninitialized, nil)",
             "    owner_vars[var.name] = TypeDeclarationWithLocation.new(var_type.virtual_type, node.location.not_nil!, uninitialized, nil)" +
             hook("node", "declare_var", "var_type", "class_variable", "var", detail='"#{owner}::#{var.name}"')),
            ("    add_external external",
             "    add_external external" + hook("node", "declare_fun", "external", "external_signature_registered")),
            ("    declare_c_struct_or_union_field(type, field_name, ivar, node.location)",
             "    declare_c_struct_or_union_field(type, field_name, ivar, node.location)" +
             hook("node", "declare_var", "field_type", "c_field_registered", detail='"#{type}::#{field_name}"')),
            ("    type.add_def getter\n\n    false",
             "    type.add_def getter" + hook("node", "declare_var", "var_type", "external_variable", detail='"#{type}::#{node.name}"') + "\n\n    false"),
        ],
        "semantic/main_visitor.cr": [
            ("        @vars[name] = filtered_var",
             "        @vars[name] = filtered_var\n        {% if flag?(:lab_full) %}\n          Observatory.recorder.try do |rec|\n            if site = rec.current_node\n              rec.observe(site, \"narrow_type\", self.class.name, filtered_var.type?, \"type_filter\", detail: name, before: rec.type_name(existing_var))\n            end\n          end\n        {% end %}"),
            ("      @vars[var_name] = simple_var\n\n      check_exception_handler_vars",
             "      @vars[var_name] = simple_var" + hook("node", "assign_type", "simple_var.type?", "local_assignment", "target", detail='"#{var_name}; cumulative=#{meta_var.type?}; scope=#{@scope || current_type}"') + "\n\n      check_exception_handler_vars"),
            ("          program.const_initializers << type",
             "          program.const_initializers << type" + hook("node", "assign_type", "type.value.type?", "constant_initialized", "type.value")),
        ],
        "semantic/call.cr": [
            ("            typed_def.body.accept visitor",
             hook("self", "instantiate_def", "typed_def", "begin_instantiation", "typed_def", visitor='"Crystal::MainVisitor"') +
             "\n            typed_def.body.accept visitor" + hook("self", "instantiate_def", "typed_def.type?", "end_instantiation", "typed_def", visitor='"Crystal::MainVisitor"')),
        ],
        "macros/interpreter.cr": [
            ("      new(program, scope, path_lookup, a_macro.location, vars, call.block, a_def, in_macro, call)",
             '      vars.each do |name, value|' + hook("call", "bind_macro_var", "value", "macro_argument", "value", "name", '"Crystal::MacroInterpreter"') + "\n      end\n      new(program, scope, path_lookup, a_macro.location, vars, call.block, a_def, in_macro, call)"),
            ("      body.accept self\n\n      false",
             hook("node", "macro_branch", "body", "evaluated_condition", "node.cond", '@last.truthy? ? "then" : "else"') + "\n      body.accept self\n\n      false"),
            ("        @vars[target.name] = @last",
             "        @vars[target.name] = @last" + hook("node", "bind_macro_var", "@last", "macro_assignment", "target")),
            ("          node.body.accept self\n        end",
             hook("node", "macro_iteration", "index", "range_iteration", "element") + "\n          node.body.accept self\n        end"),
            ("        node.body.accept self\n      end\n\n      @vars.delete element_var.name",
             hook("node", "macro_iteration", "index", "array_iteration", "@vars[element_var.name]") + "\n        node.body.accept self\n      end\n\n      @vars.delete element_var.name"),
            ("        node.body.accept self\n      end\n\n      @vars.delete key_var.name",
             hook("node", "macro_iteration", "i", "hash_iteration", "key") + "\n        node.body.accept self\n      end\n\n      @vars.delete key_var.name"),
        ],
        "codegen/codegen.cr": [
            ("          @codegen.accept node\n        end",
             "          @codegen.accept node" + hook("node", "select_well_known_fun", "node.name", "runtime_required") +
             "\n        else" + hook("node", "select_well_known_fun", "node.name", "not_runtime_required") + "\n        end"),
        ],
        "semantic/normalizer.cr": [
            ("      node.expressions.each do |exp|",
             "      node.expressions.each_with_index do |exp, index|"),
            ("        break if @dead_code",
             "        if @dead_code\n          node.expressions.skip(index + 1).each do |removed|" + hook("node", "remove_dead_code", "removed", "after_terminator", "removed") +
             "\n          end\n          break\n        end"),
            ("          temp_assign = Assign.new(temp_var.clone, middle).at(middle)",
             "          temp_assign = Assign.new(temp_var.clone, middle).at(middle)" + hook("node", "rewrite", "temp_var", "comparison_temporary", "temp_assign")),
        ],
        "semantic/cleanup_transformer.cr": [
            ("        break if flatten_collect(new_exp, exps)",
             "        if flatten_collect(new_exp, exps)\n          node.expressions.skip(i + 1).each do |removed|" +
             hook("node", "remove_dead_code", "removed", "after_no_return_or_terminator", "removed") + "\n          end\n          break\n        end"),
        ],
        "codegen/fun.cr": [
            ("      args = codegen_fun_signature(mangled_name, target_def, self_type, is_fun_literal, is_closure)",
             "      args = codegen_fun_signature(mangled_name, target_def, self_type, is_fun_literal, is_closure)\n      {% if flag?(:lab_full) %}\n        Observatory.recorder.try &.activity(\"begin_function\", target_def, self.class.name, after: mangled_name, reason: \"function_signature_created\", llvm_function: mangled_name)\n      {% end %}"),
        ],
        "semantic/top_level_visitor.cr": [
            ("    scope.types[name] = const",
             "    scope.types[name] = const" + hook("node", "declare_const", "name", "constant_registered", "value", '"#{scope}"')),
            ("        new_expansions[node] = new_method",
             "        new_expansions[node] = new_method" + hook("node", "register_initializer", "new_method", "generated_new", "new_method")),
            ("      target.add_macro node",
             "      target.add_macro node" + hook("node", "declare_fun", "node.name", "macro_registered")),
        ],
    }


def instrument(source, replacements, path):
    marker = "# Observatory activity instrumentation"
    if marker in source:
        raise ValueError(f"Activity instrumentation expected one source match in {path}: already instrumented")
    for before, after in replacements:
        if source.count(before) != 1:
            raise ValueError(f"Activity instrumentation expected one source match in {path}: {before!r}")
        source = source.replace(before, after, 1)
    return marker + "\n" + source


def apply(tree: Path):
    outputs = {}
    for relative, replacements in changes().items():
        path = tree / "compiler/crystal" / relative
        outputs[path] = instrument(path.read_text(), replacements, relative)
    for path, source in outputs.items():
        path.write_text(source)
