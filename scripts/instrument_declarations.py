"""Instrument successful top-level operations in the pinned compiler source."""
from pathlib import Path


def instrument(source: str) -> str:
    changes = [
        (
            "    node.resolved_type = type\n\n    process_annotations(annotations) do",
            """    node.resolved_type = type
    {% if flag?(:lab_full) %}
      Observatory.recorder.try do |rec|
        rec.declare_type(node, type, scope, created_new_type)
        rec.declare_inheritance(node, type, superclass) if created_new_type
      end
    {% end %}

    process_annotations(annotations) do""",
        ),
        (
            "    scope, name, type = lookup_type_def(node)\n\n    if type\n      type = type.remove_alias\n\n      unless type.module?",
            "    scope, name, type = lookup_type_def(node)\n    created_new_type = type.nil?\n\n    if type\n      type = type.remove_alias\n\n      unless type.module?",
        ),
        (
            "    node.resolved_type = type\n\n    attach_doc type, node, annotations\n\n    process_annotations",
            """    node.resolved_type = type
    {% if flag?(:lab_full) %}
      Observatory.recorder.try &.declare_type(node, type, scope, created_new_type)
    {% end %}

    attach_doc type, node, annotations

    process_annotations""",
        ),
        (
            "    target_type.add_def node\n\n    node.set_type",
            """    previous_definition = target_type.add_def node
    {% if flag?(:lab_full) %}
      Observatory.recorder.try &.declare_method(node, target_type, previous_definition)
    {% end %}

    node.set_type""",
        ),
        (
            "      current_type.as(ModuleType).include type\n      run_hooks",
            """      current_type.as(ModuleType).include type
      {% if flag?(:lab_full) %}
        Observatory.recorder.try &.declare_include(node, current_type, type, kind)
      {% end %}
      run_hooks""",
        ),
    ]
    for before, after in changes:
        if source.count(before) != 1:
            raise ValueError(f"Declaration instrumentation expected one source match: {before!r}")
        source = source.replace(before, after, 1)
    return source


def apply(tree: Path):
    path = tree / "compiler/crystal/semantic/top_level_visitor.cr"
    path.write_text(instrument(path.read_text()))
