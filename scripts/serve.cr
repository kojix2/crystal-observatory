#!/usr/bin/env crystal
require "http/server"
require "http/server/handlers/static_file_handler"
require "./support/common"

# StaticFileHandler lists directories by default; match the old server's
# index.html behavior so opening the advertised URL launches the app.
class ObservatoryStaticFileHandler < HTTP::StaticFileHandler
  protected def request_path(path : String) : String
    index = Path.posix(path).expand("/").relative_to("/") / "index.html"
    if path.ends_with?("/") && File.file?(@public_dir / index)
      path + "index.html"
    else
      path
    end
  end
end

ObservatoryScripts.cli do
  port = 8000
  OptionParser.parse do |options|
    options.banner = "Usage: serve.cr [--port PORT]"
    options.on("--port PORT", "Listen on localhost (default: 8000)") { |value| port = value.to_i }
    options.on("-h", "--help", "Show help") { puts options; exit }
  end
  raise "Unexpected arguments: #{ARGV.join(' ')}" unless ARGV.empty?
  raise "Port must be between 0 and 65535" unless (0..65535).includes?(port)
  root = ObservatoryScripts::ROOT / "web"
  unless File.file?(root / "vendor/browser_wasi_shim/index.js")
    raise "Run npm ci --ignore-scripts and npm run web:deps before serving."
  end
  server = HTTP::Server.new([ObservatoryStaticFileHandler.new(root.to_s)])
  address = server.bind_tcp("127.0.0.1", port)
  puts "Open http://#{address}/"
  STDOUT.flush
  Signal::INT.trap { server.close }
  Signal::TERM.trap { server.close }
  server.listen
end
