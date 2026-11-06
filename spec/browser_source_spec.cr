require "./scripts_spec_helper"
require "../scripts/support/prepare_browser_source"

describe ObservatoryScripts::BrowserSource do
  if File.file?(ScriptSpec::ROOT / "vendor/crystal-browser-src/compiler/crystal.cr")
    it "prepares pinned source with patch, reuses matching receipts and refuses stale inputs" do
      ObservatoryScripts.temporary_directory do |output|
        target = ObservatoryScripts::BrowserSource.prepare(output)
        File.read(target / "compiler/crystal/codegen/exception.cr").should contain("funclet_eh = msvc || wasm_target")
        File.read(target / "compiler/crystal/semantic/top_level_visitor.cr").should contain("declare_method(node, target_type, previous_definition)")
        File.write(target / "local-edit", "keep me")
        ObservatoryScripts::BrowserSource.prepare(output).should eq(target)
        File.read(target / "local-edit").should eq("keep me")
        File.write(output / "source-inputs.json", "{}")
        expect_raises(Exception, /unknown or stale inputs/) do
          ObservatoryScripts::BrowserSource.prepare(output)
        end
        File.read(target / "local-edit").should eq("keep me")
      end
    end

    it "leaves no build tree or receipt when the patch cannot be applied" do
      ObservatoryScripts.temporary_directory do |root|
        # A tiny root with a deliberately incompatible patch fails before
        # instrumentation, without publishing a partially patched build tree.
        {"deps", "patches", "scripts/support"}.each { |path| Dir.mkdir_p(root / path) }
        lock = JSON.parse(File.read(ScriptSpec::ROOT / "deps/sources.lock.json"))
        File.symlink(ScriptSpec::ROOT / "vendor", root / "vendor")
        File.write(root / "deps/sources.lock.json", lock.to_json)
        File.write(root / "patches/browser-port.patch", "--- a/missing.cr\n+++ b/missing.cr\n@@ -1 +1 @@\n-missing\n+replacement\n")
        {"instrument_declarations.cr", "instrument_activities.cr", "support/prepare_browser_source.cr"}.each do |path|
          FileUtils.cp(ScriptSpec::ROOT / "scripts" / path, root / "scripts" / path)
        end
        output = root / "output"
        expect_raises(Exception, /patch failed/) { ObservatoryScripts::BrowserSource.prepare(output, root) }
        Dir.children(output).should be_empty
      end
    end
  else
    pending "pinned source preparation (run make browser-deps)" { }
  end
end
