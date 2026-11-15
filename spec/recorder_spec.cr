require "spec"
require "../src/lab/hooks"

module RecorderSpec
  class LibraryVisitor < Crystal::Visitor
    def initialize(@contexts : Array(Tuple(Crystal::ASTNode?, String, String)))
    end

    def visit(node)
      rec = Observatory.recorder.not_nil!
      @contexts << {rec.current_node, rec.current_visitor, rec.parent_visitor(self.class.name)}
      false
    end
  end

  class UserVisitor < Crystal::Visitor
    def initialize(@helper : Crystal::ASTNode, @contexts : Array(Tuple(Crystal::ASTNode?, String, String)))
    end

    def visit(node)
      @helper.accept(LibraryVisitor.new(@contexts))
      false
    end
  end

  class FailingVisitor < Crystal::Visitor
    def visit(node)
      raise "visitor failed"
    end
  end

  class TailTransformer < Crystal::Transformer
    def transform(node : Crystal::NumberLiteral)
      node.value = "3" if node.value == "2"
      node
    end
  end

  def self.parse(source)
    parser = Crystal::Parser.new(source)
    parser.filename = "input.cr"
    parser.parse
  end
end

describe Observatory::Recorder do
  after_each { Observatory.recorder = nil }

  it "keeps unrecorded library dispatch context separate from recorded frames" do
    rec = Observatory::Recorder.new("1", "input.cr", "test")
    user = RecorderSpec.parse("1")
    helper = Crystal::NumberLiteral.new("2", :i32).at(Crystal::Location.new("library.cr", 1, 1))
    contexts = [] of Tuple(Crystal::ASTNode?, String, String)
    Observatory.recorder = rec
    user.accept(RecorderSpec::UserVisitor.new(helper, contexts))
    contexts.should eq([{helper, "RecorderSpec::LibraryVisitor", "RecorderSpec::UserVisitor"}])
    rec.bundle.events.map(&.visitor).uniq.should eq(["RecorderSpec::UserVisitor"])
    rec.current_node.should be_nil
    rec.current_visitor.should eq("")
  end

  it "restores dispatch and visit stacks after exceptions and muted serialization" do
    rec = Observatory::Recorder.new("1", "input.cr", "test")
    node = RecorderSpec.parse("1")
    Observatory.recorder = rec
    expect_raises(Exception, "visitor failed") { node.accept(RecorderSpec::FailingVisitor.new) }
    rec.bundle.events.map(&.kind).should eq(["visit_enter", "visit_leave"])
    rec.current_node.should be_nil
    rec.current_visitor.should eq("")
    rec.silence { node.to_s }.should eq("1")
    rec.bundle.events.size.should eq(2)
    rec.event("after")
    rec.bundle.events.last.depth.should eq(0)
    rec.bundle.events.last.parent_id.should eq(0)
  end

  it "excludes only the compiler-provided automatic prelude identity" do
    rec = Observatory::Recorder.new("require \"prelude\"", "input.cr", "test")
    explicit = RecorderSpec.parse(rec.bundle.source)
    automatic = Crystal::Require.new("prelude").at(Crystal::Location.new("input.cr", 1, 1))
    rec.automatic_prelude = automatic
    rec.user_node?(explicit).should be_true
    rec.user_node?(automatic).should be_false
    root = Crystal::Expressions.new([automatic, explicit] of Crystal::ASTNode)
    rec.snapshot("Parse", root)
    rec.bundle.snapshots.first.nodes.count(&.kind.==("Require")).should eq(1)
  end

  it "records completed string array tokens instead of intermediate lexer state" do
    rec = Observatory::Recorder.new("%w(a b)\n%i(c d)\n", "input.cr", "test")
    Observatory.recorder = rec
    RecorderSpec.parse(rec.bundle.source)
    tokens = rec.bundle.tokens.select(&.kind.==("STRING"))
    tokens.map(&.value).should eq(["a", "b", "c", "d"])
    tokens.map(&.mode).uniq.should eq(["string array"])
  end

  it "detects in-place rewrites past the node preview limit" do
    source = "1\n" * 600 + "2\n"
    rec = Observatory::Recorder.new(source, "input.cr", "test")
    node = RecorderSpec.parse(source)
    Observatory.recorder = rec
    result = node.transform(RecorderSpec::TailTransformer.new)
    result.same?(node).should be_true
    rewrite = rec.bundle.events.find { |event| event.kind == "rewrite" && event.node_id == rec.id(node) }.not_nil!
    rewrite.before.size.should be > 1000
    rewrite.before.should end_with("2\n")
    rewrite.after.should end_with("3\n")
  end

  it "does not emit node-zero dispatches or activities when node storage fills" do
    rec = Observatory::Recorder.new("1", "input.cr", "test")
    Observatory::Recorder::MAX_NODES.times do
      rec.id(Crystal::NumberLiteral.new("1", :i32))
    end
    node = RecorderSpec.parse("2")
    rec.enter(node, "test").should be_false
    rec.event("type", node, after: "Int32").should be_nil
    rec.activity("assign_type", node, "test", after: "Int32")
    rec.bundle.events.should be_empty
    rec.bundle.truncated.should be_true
  end

  it "does not push a visit frame when event storage fills" do
    rec = Observatory::Recorder.new("1", "input.cr", "test")
    Observatory::Recorder::MAX_EVENTS.times { rec.event("test") }
    rec.enter(RecorderSpec.parse("1"), "test").should be_false
    rec.bundle.events.size.should eq(Observatory::Recorder::MAX_EVENTS)
    rec.bundle.truncated.should be_true
  end

  it "marks recordings incomplete when tokens reach their storage limit" do
    rec = Observatory::Recorder.new("1", "input.cr", "test")
    token = Crystal::Token.new
    token.filename = "input.cr"
    token.type = :NUMBER
    token.line_number = 1
    (Observatory::Recorder::MAX_EVENTS + 1).times do |index|
      token.column_number = index + 1
      rec.token(token, "normal")
    end
    rec.bundle.tokens.size.should eq(Observatory::Recorder::MAX_EVENTS)
    rec.bundle.truncated.should be_true
  end
end
