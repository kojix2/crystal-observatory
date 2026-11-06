require "./scripts_spec_helper"
require "../scripts/instrument_declarations"
require "../scripts/instrument_activities"

describe ObservatoryScripts::Declarations do
  it "rejects unknown compiler source without writing" do
    ObservatoryScripts.temporary_directory do |tree|
      path = tree / "compiler/crystal/semantic/top_level_visitor.cr"
      Dir.mkdir_p(path.parent)
      File.write(path, "unknown compiler source")
      expect_raises(Exception, /expected one source match/) do
        ObservatoryScripts::Declarations.apply(tree)
      end
      File.read(path).should eq("unknown compiler source")
    end
  end

  path = ScriptSpec::ROOT / "vendor/crystal-browser-src/compiler/crystal/semantic/top_level_visitor.cr"
  if File.file?(path)
    it "instruments pinned source and rejects duplicate application" do
      result = ObservatoryScripts::Declarations.instrument(File.read(path))
      result.scan("rec.declare_type(").size.should eq(1)
      result.scan("&.declare_type(").size.should eq(1)
      result.should contain("if created_new_type")
      result.should contain("current_type.as(ModuleType).include type\n      {% if")
      result.should contain("previous_definition = target_type.add_def node\n    {% if")
      result.should contain("declare_method(node, target_type, previous_definition)")
      result.scan("flag?(:lab_full)").size.should eq(4)
      expect_raises(Exception) { ObservatoryScripts::Declarations.instrument(result) }
    end
  else
    pending "pinned declaration instrumentation (run make browser-deps)" { }
  end
end

describe ObservatoryScripts::Activities do
  root = ScriptSpec::ROOT / "vendor/crystal-browser-src/compiler/crystal"
  if Dir.exists?(root)
    it "matches pinned sources once and rejects repeated or ambiguous instrumentation" do
      ObservatoryScripts::Activities::CHANGES.each do |name, changes|
        source = File.read(root / name)
        result = ObservatoryScripts::Activities.instrument(source, changes, name)
        result.should contain("flag?(:lab_full)")
        expect_raises(Exception) { ObservatoryScripts::Activities.instrument(result, changes, name) }
        expect_raises(Exception) { ObservatoryScripts::Activities.instrument(source + source, changes, name) }
      end
    end
  else
    pending "pinned activity instrumentation (run make browser-deps)" { }
  end

  it "does not partially write the build tree when a later file fails validation" do
    ObservatoryScripts.temporary_directory do |tree|
      files = {} of Path => String
      ObservatoryScripts::Activities::CHANGES.each_with_index do |(name, changes), index|
        path = tree / "compiler/crystal" / name
        Dir.mkdir_p(path.parent)
        # The first file is valid; failure in the second must leave it untouched.
        source = index == 0 ? changes.map(&.[0]).join("\n") : "unknown compiler source"
        File.write(path, source)
        files[path] = source
      end
      expect_raises(Exception, /expected one source match/) do
        ObservatoryScripts::Activities.apply(tree)
      end
      files.each { |path, source| File.read(path).should eq(source) }
    end
  end
end
