require "./scripts_spec_helper"
require "../scripts/support/package"

describe ObservatoryScripts::Package do
  it "packages source and prebuilt assets while excluding dependencies, secrets and symlinks" do
    ObservatoryScripts.temporary_directory do |root|
      included = ["README.md", "scripts/serve.cr", "web/syntax.wasm", "web/traces/manifest.json", "web/traces/01.json.gz", "patches/browser-port.patch"]
      excluded = [".git/config", ".cache/tool", "node_modules/package/index.js", "vendor/crystal-src/hello.cr", "vendor/.source-partial/file", "web/vendor/prismjs/prism.js", "web/traces/.samples-temp/file", "web/traces/01.json", ".env", "debug.log", "dist/old.zip"]
      (included + excluded).each do |relative|
        path = root / relative
        Dir.mkdir_p(path.parent)
        File.write(path, relative)
      end
      File.symlink("README.md", root / "link")
      File.symlink("scripts", root / "linked-dir")
      File.chmod(root / "scripts/serve.cr", 0o755)
      ObservatoryScripts::Package.source_files(root).map(&.to_s).sort.should eq(included.sort)
      archive = root / "dist/source.zip"
      ObservatoryScripts::Package.create(archive, root)
      # Reusing the output must not retain files removed since the last package.
      File.delete(root / "README.md")
      ObservatoryScripts::Package.create(archive, root)
      status = Process.run("unzip", ["-q", archive.to_s, "-d", (root / "unpacked").to_s], error: STDERR)
      status.success?.should be_true
      unpacked = root / "unpacked/crystal-observatory"
      File.exists?(unpacked / "README.md").should be_false
      File.read(unpacked / "patches/browser-port.patch").should eq("patches/browser-port.patch")
      File.info(unpacked / "scripts/serve.cr").permissions.value.should eq(0o755)
      File.exists?(unpacked / ".env").should be_false
    end
  end
end
