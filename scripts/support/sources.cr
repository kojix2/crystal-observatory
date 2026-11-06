require "compress/zip"
require "./common"

# Crystal's ZIP reader discards Unix file attributes. Capture them from the
# central-directory header so restoration can preserve symlinks and executable
# bits. The standard reader still handles ZIP parsing, decompression and CRCs.
class Compress::Zip::File::Entry
  getter unix_mode : UInt32

  def initialize(@io : IO)
    header_offset = @io.pos
    super(at_central_directory_header: @io)
    @unix_mode = @io.read_at(header_offset + 34, 4) do |header|
      header.read_bytes(UInt32, IO::ByteFormat::LittleEndian) >> 16
    end
  end
end

module ObservatoryScripts::Sources
  STAMP = ".observatory-source.json"

  def self.extract(archive : Path, spec : JSON::Any, target : Path)
    count = 0
    prefix = spec["prefix"].as_s
    selected = spec["files"]?.try(&.as_a.map(&.as_s))
    Compress::Zip::File.open(archive) do |zip|
      zip.entries.each do |entry|
        next if entry.dir? || !entry.filename.starts_with?(prefix)
        relative = entry.filename.byte_slice(prefix.bytesize)
        next if selected && !selected.includes?(relative)
        path = Path.posix(relative)
        if relative.empty? || path.absolute? || path.parts.includes?("..")
          raise "Unsafe archive path: #{relative}"
        end
        destination = target / path
        # Never write through a link created by an earlier archive entry, even
        # if it currently points inside the tree. This also rejects link chains.
        current = target
        path.parts.each do |part|
          current /= part
          raise "Archive path escapes destination through symlink: #{relative}" if File.symlink?(current)
        end
        Dir.mkdir_p(destination.parent)
        if entry.unix_mode & 0o170000 == 0o120000
          link = entry.open(&.gets_to_end)
          resolved = (path.parent / link).normalize
          if Path.posix(link).absolute? || resolved.parts.first? == ".."
            raise "Unsafe archive symlink: #{relative}"
          end
          File.symlink(link, destination)
        else
          File.open(destination, "w") do |output|
            entry.open { |input| IO.copy(input, output) }
          end
          File.chmod(destination, entry.unix_mode & 0o111 == 0 ? 0o644 : 0o755)
        end
        count += 1
      end
    end
    raise "Archive contains no selected source files" if count == 0
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
