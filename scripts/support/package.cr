require "./common"

module ObservatoryScripts::Package
  EXCLUDED_DIRS  = {".git", ".cache", "__pycache__", "node_modules", ".idea", ".vscode"}
  EXCLUDED_TREES = {
    "dist", "build", "vendor/crystal-src", "vendor/crystal-browser-src",
    "web/vendor/prismjs", "web/vendor/browser_wasi_shim", "web/vendor/browser_wasi_shim.staging",
  }
  EXCLUDED_FILES    = {".env", ".env.local", ".DS_Store", "Thumbs.db"}
  EXCLUDED_SUFFIXES = {".zip", ".log", ".pyc", ".pyo", ".swp", ".swo"}

  def self.source_files(root : Path, relative = Path["."]) : Array(Path)
    files = [] of Path
    # Prune dependencies before walking them: a local LLVM build can be huge.
    Dir.children(root / relative).sort.each do |name|
      rel = (relative / name).normalize
      path = root / rel
      next if File.symlink?(path)
      if File.directory?(path)
        next if EXCLUDED_DIRS.includes?(name) || EXCLUDED_TREES.includes?(rel.to_s)
        next if relative == Path["vendor"] && name.starts_with?(".source-")
        next if relative == Path["web/traces"] && name.starts_with?(".samples-")
        files.concat(source_files(root, rel))
      else
        next if EXCLUDED_FILES.includes?(name) || EXCLUDED_SUFFIXES.includes?(rel.extension)
        next if rel.parts[0, 2] == ["web", "traces"] && name.ends_with?(".json") && name != "manifest.json"
        files << rel
      end
    end
    files
  end

  def self.create(output : Path, root = ObservatoryScripts::ROOT)
    files = source_files(root)
    Dir.mkdir_p(output.parent)
    ObservatoryScripts.temporary_directory do |temporary|
      tree = temporary / "crystal-observatory"
      # Give zip the fixed archive prefix without copying the source tree.
      # source_files excludes symlinks; this temporary parent link is only a
      # route to those regular files, and is not itself added to the archive.
      File.symlink(root.expand, tree)
      # Build a new archive, so reusing an output path cannot retain stale files.
      archive = temporary / "source.zip"
      names = files.map { |relative| "crystal-observatory/#{relative}" }
      status = Process.run("zip", ["-q", "-9", archive.to_s] + names, chdir: temporary.to_s, output: STDOUT, error: STDERR)
      raise "zip failed (#{status})" unless status.success?
      ObservatoryScripts.run("unzip", ["-tq", archive.to_s])
      FileUtils.cp(archive, output)
    end
    puts "#{files.size} files; #{File.size(output).format(delimiter: ',')} bytes: #{output}"
  end
end
