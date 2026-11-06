require "./scripts_spec_helper"
require "../scripts/support/sources"
require "compress/zip" # Construct invalid archives for the rejection tests.

describe ObservatoryScripts::Sources do
  it "restores only the selected subtree, preserves modes and links, and keeps local edits" do
    ScriptSpec.with_sources do |root, cache, archive, spec|
      ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
      target = root / "vendor/example"
      File.exists?(target / "README.md").should be_false
      File.symlink?(target / "link.cr").should be_true
      File.readlink(target / "link.cr").should eq("hello.cr")
      File.info(target / "hello.cr").permissions.value.should eq(0o755)
      File.write(target / "hello.cr", "local edit")
      ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
      File.read(target / "link.cr").should eq("local edit")
      JSON.parse(File.read(target / ObservatoryScripts::Sources::STAMP)).should eq(spec)
    end
  end

  it "leaves no partial installation after a corrupt cache" do
    ScriptSpec.with_sources do |root, cache, archive, spec|
      File.write(archive, "corrupt")
      expect_raises(Exception, /SHA256 mismatch/) do
        ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
      end
      File.exists?(root / "vendor/example").should be_false
    end
  end

  it "refuses unknown source trees and a different source lock" do
    ScriptSpec.with_sources do |root, cache, archive, spec|
      target = root / "vendor/example"
      Dir.mkdir_p(target)
      File.write(target / "hello.cr", "keep me")
      expect_raises(Exception, /unrecognized/) do
        ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
      end
      File.write(target / ObservatoryScripts::Sources::STAMP, "{}")
      expect_raises(Exception, /another lock/) do
        ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
      end
      File.read(target / "hello.cr").should eq("keep me")
    end
  end

  it "fails offline when the archive is absent" do
    ScriptSpec.with_sources do |root, cache, archive, spec|
      File.delete(archive)
      expect_raises(Exception, /Missing cached archive/) do
        ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
      end
      Dir.children(cache).should be_empty
    end
  end

  it "publishes verified downloads and removes temporary files after failed verification" do
    {true, false}.each do |valid|
      ScriptSpec.with_sources do |root, cache, archive, spec|
        download = root / "download.zip"
        File.rename(archive, download)
        spec.as_h["url"] = JSON::Any.new("file://#{download}")
        File.write(download, "corrupt") unless valid
        if valid
          ObservatoryScripts::Sources.install("example", spec, root, cache)
          Dir.children(cache).should eq(["example.zip"])
          ObservatoryScripts.digest(archive).should eq(spec["sha256"].as_s)
        else
          expect_raises(Exception, /downloaded archive SHA256 mismatch/) do
            ObservatoryScripts::Sources.install("example", spec, root, cache)
          end
          Dir.children(cache).should be_empty
          File.exists?(root / "vendor/example").should be_false
        end
      end
    end
  end

  it "rejects absolute paths and parent traversal without leaving a partial tree" do
    {"upstream/src/../../outside", "upstream/src//absolute"}.each do |filename|
      ScriptSpec.with_sources do |root, cache, archive, spec|
        Compress::Zip::Writer.open(archive) { |zip| zip.add(filename, "x") }
        spec.as_h["sha256"] = JSON::Any.new(ObservatoryScripts.digest(archive))
        expect_raises(Exception, /Unsafe archive path/) do
          ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
        end
        File.exists?(root / "vendor/example").should be_false
        File.exists?(root / "outside").should be_false
        Dir.children(root / "vendor").should be_empty
      end
    end
  end

  it "rejects symlinks escaping the source tree" do
    {"../../outside", "/tmp/outside"}.each do |link|
      ScriptSpec.with_sources do |root, cache, archive, spec|
        File.delete(root / "upstream/src/link.cr")
        File.symlink(link, root / "upstream/src/link.cr")
        ScriptSpec.zip(root, archive)
        spec.as_h["sha256"] = JSON::Any.new(ObservatoryScripts.digest(archive))
        expect_raises(Exception, /Unsafe archive symlink/) do
          ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
        end
        File.exists?(root / "vendor/example").should be_false
      end
    end
  end

  it "does not write through an earlier symlink" do
    ScriptSpec.with_sources do |root, cache, archive, spec|
      # Add the symlink before its child using separate zip invocations.
      source = root / "upstream/src"
      Dir.mkdir(source / "nested")
      File.write(source / "nested/hello.cr", "keep me")
      File.symlink("nested", source / "alias")
      File.delete(archive)
      status = Process.run("zip", ["-q", "-y", archive.to_s, "upstream/src/alias"], chdir: root.to_s)
      status.success?.should be_true
      status = Process.run("zip", ["-q", archive.to_s, "upstream/src/alias/hello.cr"], chdir: root.to_s)
      status.success?.should be_true
      spec.as_h["sha256"] = JSON::Any.new(ObservatoryScripts.digest(archive))
      expect_raises(Exception, /through another file/) do
        ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
      end
      File.exists?(root / "vendor/example").should be_false
      File.read(source / "nested/hello.cr").should eq("keep me")
    end
  end

  it "extracts selected filenames literally, including unzip pattern characters" do
    ScriptSpec.with_sources do |root, cache, archive, spec|
      filenames = ["file[1].cr", "file*literal.cr", "question?.cr", "with space.cr"]
      filenames.each { |name| File.write(root / "upstream/src" / name, name) }
      File.write(root / "upstream/src/file1.cr", "not selected")
      ScriptSpec.zip(root, archive)
      spec.as_h["files"] = JSON.parse(filenames.to_json)
      spec.as_h["sha256"] = JSON::Any.new(ObservatoryScripts.digest(archive))
      ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
      target = root / "vendor/example"
      Dir.children(target).sort.should eq((filenames + [ObservatoryScripts::Sources::STAMP]).sort)
      filenames.each { |name| File.read(target / name).should eq(name) }
    end
  end

  it "selects an explicit file list and rejects empty selections" do
    ScriptSpec.with_sources do |root, cache, archive, spec|
      spec.as_h["files"] = JSON.parse(["hello.cr"].to_json)
      ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
      File.exists?(root / "vendor/example/link.cr").should be_false
    end
    ScriptSpec.with_sources do |root, cache, archive, spec|
      spec.as_h["files"] = JSON.parse(["missing.cr"].to_json)
      expect_raises(Exception, /no selected source files/) do
        ObservatoryScripts::Sources.install("example", spec, root, cache, offline: true)
      end
      File.exists?(root / "vendor/example").should be_false
    end
  end
end
