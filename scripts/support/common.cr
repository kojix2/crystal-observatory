require "digest/sha256"
require "file_utils"
require "json"
require "option_parser"

module ObservatoryScripts
  ROOT = Path.new(__DIR__).parent.parent

  def self.digest(path : Path | String) : String
    Digest::SHA256.new.file(path.to_s).hexfinal
  end

  def self.run(command, args, *, input = Process::Redirect::Close, output = STDOUT)
    status = Process.run(command, args, input: input, output: output, error: STDERR)
    raise "#{command} failed (#{status})" unless status.success?
  end

  def self.temporary_directory(parent = Path[Dir.tempdir], prefix = "observatory-", &)
    directory = Path[File.tempname(prefix, nil, dir: parent.to_s)]
    Dir.mkdir(directory)
    begin
      yield directory
    ensure
      FileUtils.rm_rf(directory)
    end
  end

  def self.cli(&)
    yield
  rescue error
    STDERR.puts error.message
    exit 1
  end

  def self.arguments(usage : String, count : Int32) : Array(String)
    parser = OptionParser.new do |options|
      options.banner = usage
      options.on("-h", "--help", "Show help") { puts options; exit }
    end
    parser.parse
    raise parser.to_s unless ARGV.size == count
    ARGV
  end
end
