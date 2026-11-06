require "set"
require "./common"

module ObservatoryScripts::Sources
  STAMP     = ".observatory-source.json"
  UNZIP_ENV = {"UNZIP" => nil, "UNZIPOPT" => nil, "ZIPINFO" => nil, "ZIPINFOOPT" => nil}

  def self.extract(archive : Path, spec : JSON::Any, target : Path)
    prefix = spec["prefix"].as_s
    selected = spec["files"]?.try(&.as_a.map(&.as_s))
    listing = IO::Memory.new
    ObservatoryScripts.run("unzip", ["-Z1", archive.to_s], output: listing, env: UNZIP_ENV)
    members = {} of String => Path
    paths = Set(Path).new
    listing.to_s.each_line do |filename|
      next if filename.ends_with?('/') || !filename.starts_with?(prefix)
      relative = filename.byte_slice(prefix.bytesize)
      next if selected && !selected.includes?(relative)
      path = Path.posix(relative)
      full_path = Path.posix(filename)
      if relative.empty? || path.absolute? || full_path.absolute? || path.parts.includes?("..") || full_path.parts.includes?("..")
        raise "Unsafe archive path: #{relative}"
      end
      raise "Duplicate archive path: #{relative}" unless paths.add?(path.normalize)
      members[filename] = path
    end
    raise "Archive contains no selected source files" if members.empty?
    # A file or symlink cannot also be a parent of another selected member.
    # Check before unzip runs, regardless of the archive's entry order.
    paths.each do |path|
      parent = path.parent
      until parent == Path["."]
        raise "Archive path passes through another file: #{path}" if paths.includes?(parent)
        parent = parent.parent
      end
    end
    ObservatoryScripts.temporary_directory(target.parent, "unzip-") do |temporary|
      # unzip restores Unix symlinks and executable bits on Linux and macOS.
      # Escape its filename patterns so brackets and wildcards remain literal.
      patterns = members.keys.map { |name| name.gsub(/[*?\[\]\\]/) { |char| "\\#{char}" } }
      ObservatoryScripts.run("unzip", ["-q", archive.to_s] + patterns + ["-d", temporary.to_s], env: UNZIP_ENV)
      members.each do |filename, path|
        source = temporary / filename
        if File.symlink?(source)
          link = File.readlink(source)
          if Path.posix(link).absolute? || (path.parent / link).normalize.parts.first? == ".."
            raise "Unsafe archive symlink: #{path}"
          end
        end
      end
      members.each do |filename, path|
        source = temporary / filename
        destination = target / path
        Dir.mkdir_p(destination.parent)
        if File.symlink?(source)
          File.symlink(File.readlink(source), destination)
        else
          FileUtils.cp(source, destination)
        end
      end
    end
  end

  def self.install(name : String, spec : JSON::Any, root : Path, cache : Path, offline = false)
    destination = root / spec["destination"].as_s
    stamp = destination / STAMP
    if File.exists?(destination) || File.symlink?(destination)
      if File.file?(stamp) && JSON.parse(File.read(stamp)) == spec
        puts "#{name}: already installed at #{spec["revision"].as_s[0, 12]}"
        return
      end
      raise "#{destination} is unrecognized or uses another lock. Move it aside (preserving local changes), then retry."
    end
    Dir.mkdir_p(cache)
    archive = cache / "#{name}.zip"
    unless File.file?(archive)
      raise "Missing cached archive: #{archive}" if offline
      # A failed download must never become a reusable cached archive.
      File.tempfile(name, ".download", dir: cache.to_s) do |temporary|
        begin
          ObservatoryScripts.run("curl", ["-fL", "--retry", "2", "--connect-timeout", "60", spec["url"].as_s], output: temporary)
          temporary.flush
          unless ObservatoryScripts.digest(temporary.path) == spec["sha256"].as_s
            raise "#{name}: downloaded archive SHA256 mismatch"
          end
          File.rename(temporary.path, archive)
        ensure
          File.delete?(temporary.path)
        end
      end
    end
    unless ObservatoryScripts.digest(archive) == spec["sha256"].as_s
      raise "#{name}: cached archive SHA256 mismatch: #{archive}"
    end
    Dir.mkdir_p(destination.parent)
    ObservatoryScripts.temporary_directory(destination.parent, ".source-") do |temporary|
      tree = temporary / "tree"
      Dir.mkdir(tree)
      extract(archive, spec, tree)
      File.write(tree / STAMP, spec.to_pretty_json + "\n")
      File.rename(tree, destination)
    end
    puts "#{name}: installed #{spec["revision"].as_s[0, 12]} → #{spec["destination"].as_s}"
  end

  def self.main
    offline = false
    parser = OptionParser.new do |options|
      options.banner = "Usage: fetch_sources.cr [syntax|browser|all] [--offline]"
      options.on("--offline", "Use verified cached downloads only") { offline = true }
      options.on("-h", "--help", "Show help") { puts options; exit }
    end
    parser.parse
    raise parser.to_s if ARGV.size > 1
    group = ARGV.first? || "syntax"
    raise parser.to_s unless {"syntax", "browser", "all"}.includes?(group)
    sources = JSON.parse(File.read(ObservatoryScripts::ROOT / "deps/sources.lock.json"))
    sources.as_h.each do |name, spec|
      if group == "all" || group == spec["group"].as_s
        install(name, spec, ObservatoryScripts::ROOT, ObservatoryScripts::ROOT / ".cache/downloads", offline)
      end
    end
  end
end
