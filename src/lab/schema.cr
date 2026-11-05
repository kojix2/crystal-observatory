require "json"

module Observatory
  VERSION = "0.1.0"

  class NodeInfo
    include JSON::Serializable
    property id : Int32
    property kind : String
    property label : String
    property text : String
    property line : Int32 = 0
    property column : Int32 = 0
    property end_line : Int32 = 0
    property end_column : Int32 = 0
    property filename : String = ""
    property inferred_type : String = ""
    property children = [] of Int32
    property expanded : Int32? = nil
    property targets = [] of Int32
    property hook_expansions = [] of Int32

    def initialize(@id, @kind, @label, @text)
    end
  end

  class Event
    include JSON::Serializable
    property index : Int32 = 0
    property kind : String
    property phase : String
    property visitor : String = ""
    property node_id : Int32 = 0
    property related_id : Int32 = 0
    property parent_id : Int32 = 0
    property depth : Int32 = 0
    property before : String = ""
    property after : String = ""
    property detail : String = ""
    property llvm_function : String = ""
    property llvm_block : String = ""
    property declaration_action : String = ""
    property type_id : Int32 = 0
    property related_type_id : Int32 = 0
    property definition_id : Int32 = 0
    property replaced_definition_id : Int32 = 0
    property origin_id : Int32 = 0
    property implicit : Bool = false

    def initialize(@kind, @phase)
    end
  end

  class SemanticTypeInfo
    include JSON::Serializable
    property id : Int32
    property name : String
    property kind : String

    def initialize(@id, @name, @kind)
    end
  end

  class DefinitionInfo
    include JSON::Serializable
    property id : Int32
    property owner_id : Int32
    property node_id : Int32
    property name : String
    property signature : String
    property class_method : Bool

    def initialize(@id, @owner_id, @node_id, @name, @signature, @class_method)
    end
  end

  class Snapshot
    include JSON::Serializable
    property name : String
    property at_event : Int32
    property roots = [] of Int32
    property nodes = [] of NodeInfo

    def initialize(@name, @at_event)
    end
  end

  record TokenInfo, kind : String, value : String, line : Int32,
    column : Int32, mode : String, number_kind : String, delimiter : String do
    include JSON::Serializable
  end

  class Bundle
    include JSON::Serializable
    property schema_version = 1
    property app_version = VERSION
    property compiler_version = ""
    property host_compiler_version = Crystal::VERSION
    property llvm_version = ""
    property target = ""
    property mode = "syntax"
    property source : String = ""
    property filename = "input.cr"
    property prelude = "prelude"
    property tokens = [] of TokenInfo
    property nodes = [] of NodeInfo
    property events = [] of Event
    property snapshots = [] of Snapshot
    property llvm_ir = ""
    property errors = [] of String
    property truncated = false
    property declarations_version : Int32? = nil
    property semantic_types : Array(SemanticTypeInfo) = [] of SemanticTypeInfo
    property definitions : Array(DefinitionInfo) = [] of DefinitionInfo
    property limits = "40000 events; 8000 nodes; user source and attached dependencies only"

    def initialize(@source = "", @filename = "input.cr")
    end
  end
end
