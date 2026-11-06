require "./common"
require "../instrument_declarations"
require "../instrument_activities"

module ObservatoryScripts::BrowserSource
  def self.prepare(output : Path, root = ObservatoryScripts::ROOT) : Path
    sources = JSON.parse(File.read(root / "deps/sources.lock.json"))
    upstream = root / sources["crystal-browser"]["destination"].as_s
    patch = root / "patches/browser-port.patch"
    fingerprint = {
      "crystal"      => sources["crystal-browser"]["sha256"].as_s,
      "patch"        => ObservatoryScripts.digest(patch),
      "declarations" => ObservatoryScripts.digest(root / "scripts/instrument_declarations.cr"),
      "activities"   => ObservatoryScripts.digest(root / "scripts/instrument_activities.cr"),
      "preparation"  => ObservatoryScripts.digest(root / "scripts/support/prepare_browser_source.cr"),
    }
    target = output / "src"
    receipt = output / "source-inputs.json"
    if File.exists?(target) || File.symlink?(target)
      if File.file?(receipt) && JSON.parse(File.read(receipt)) == JSON.parse(fingerprint.to_json)
        return target
      end
      raise "#{target} uses unknown or stale inputs. Move this generated build directory aside or set BROWSER_BUILD_DIR to a new directory."
    end
    Dir.mkdir_p(output)
    ObservatoryScripts.temporary_directory(output, "prepare-") do |temporary|
      tree = temporary / "src"
      # cp -R -P preserves upstream symlinks rather than dereferencing them.
      ObservatoryScripts.run("cp", ["-R", "-P", upstream.to_s, tree.to_s])
      File.open(patch) do |input|
        ObservatoryScripts.run("patch", ["-f", "-N", "-F", "0", "-p1", "-d", tree.to_s], input: input, output: STDERR)
      end
      ObservatoryScripts::Declarations.apply(tree)
      ObservatoryScripts::Activities.apply(tree)
      File.write(temporary / "source-inputs.json", fingerprint.to_pretty_json + "\n")
      File.rename(temporary / "source-inputs.json", receipt)
      File.rename(tree, target)
    end
    target
  end
end
