require "./scripts_spec_helper"
require "../scripts/support/pack_browser"
require "compress/gzip"

describe ObservatoryScripts::CompilerAsset do
  it "writes deterministic gzip bytes and matching receipts while preserving other assets" do
    ObservatoryScripts.temporary_directory do |root|
      target = root / "web/assets/compiler/compiler.wasm.gz"
      receipts = root / "web/runtime/asset-receipts.js"
      Dir.mkdir_p(target.parent)
      Dir.mkdir_p(receipts.parent)
      File.write(receipts, "export const ASSET_RECEIPTS = {\"lld.wasm.gz\": {\"bytes\": 123, \"sha256\": \"keep\"}};\n")
      source = root / "compiler.wasm"
      File.write(source, "\0asm compiler fixture\n")
      ObservatoryScripts::CompilerAsset.install(source, root)
      first_digest = ObservatoryScripts.digest(target)
      File.rename(source, root / "renamed.wasm")
      ObservatoryScripts::CompilerAsset.install(root / "renamed.wasm", root)
      ObservatoryScripts.digest(target).should eq(first_digest)
      Compress::Gzip::Reader.open(target.to_s) { |gzip| gzip.gets_to_end.should eq("\0asm compiler fixture\n") }
      values = JSON.parse(File.read(receipts).split("export const ASSET_RECEIPTS =", 2)[1].strip.rchop(';'))
      values["compiler.wasm.gz"]["bytes"].as_i64.should eq(File.size(target))
      values["compiler.wasm.gz"]["sha256"].as_s.should eq(first_digest)
      values["lld.wasm.gz"]["sha256"].as_s.should eq("keep")
      saved_receipts = File.read(receipts)
      expect_raises(Exception, /gzip failed/) { ObservatoryScripts::CompilerAsset.install(source, root) }
      ObservatoryScripts.digest(target).should eq(first_digest)
      File.read(receipts).should eq(saved_receipts)
      Dir.children(target.parent).should eq(["compiler.wasm.gz"])
    end
  end
end
