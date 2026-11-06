require "./common"

module ObservatoryScripts::BrowserIR
  def self.prepare(opt : String, output : Path) : Process::Status
    process = Process.new(opt, ["-S", (output / "observatory.bc").to_s, "-o", "-"], input: Process::Redirect::Close, output: Process::Redirect::Pipe, error: STDERR)
    begin
      File.open(output / "no-opt.csv", "w") do |attributes|
        process.output.each_line do |line|
          next unless line.starts_with?("define ")
          next unless match = line.match(/@"([^"]+)"/)
          name = match[1]
          if name.includes?("pretty_print") || name == "*Crystal::MainVisitor#visit<Crystal::Yield>:Bool"
            attributes << name << ",optnone\n" << name << ",noinline\n"
          end
        end
      end
      process.wait
    ensure
      process.close
    end
  end
end
