require "spec"
require "../scripts/support/common"

module ScriptSpec
  ROOT = ObservatoryScripts::ROOT

  def self.with_sources(&)
    ObservatoryScripts.temporary_directory do |root|
      cache = root / "cache"
      source = root / "upstream/src"
      Dir.mkdir_p(cache)
      Dir.mkdir_p(source)
      File.write(source / "hello.cr", "puts \"hello\"\n")
      File.chmod(source / "hello.cr", 0o755)
      File.write(root / "upstream/README.md", "Not part of the requested subtree")
      File.symlink("hello.cr", source / "link.cr")
      archive = cache / "example.zip"
      zip(root, archive)
      spec = JSON.parse({
        revision:    "a" * 40,
        sha256:      ObservatoryScripts.digest(archive),
        prefix:      "upstream/src/",
        destination: "vendor/example",
      }.to_json)
      yield root, cache, archive, spec
    end
  end

  def self.zip(root : Path, archive : Path)
    File.delete(archive) if File.exists?(archive)
    status = Process.run("zip", ["-q", "-r", "-y", archive.to_s, "upstream"], chdir: root.to_s, error: STDERR)
    raise "Fixture ZIP failed" unless status.success?
  end
end
