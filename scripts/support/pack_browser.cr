require "./common"

module ObservatoryScripts::CompilerAsset
  def self.install(source : Path, root = ObservatoryScripts::ROOT)
    target = root / "web/assets/compiler/compiler.wasm.gz"
    receipts = root / "web/runtime/asset-receipts.js"
    values = JSON.parse(File.read(receipts).split("export const ASSET_RECEIPTS =", 2)[1].strip.rchop(';'))
    # -n omits the original name and timestamp, making repeated builds identical.
    File.tempfile("compiler-", ".gz", dir: target.parent.to_s) do |temporary|
      begin
        ObservatoryScripts.run("gzip", ["-9", "-n", "-c", "--", source.to_s], output: temporary)
        temporary.flush
        values.as_h["compiler.wasm.gz"] = JSON.parse({bytes: temporary.size, sha256: ObservatoryScripts.digest(temporary.path)}.to_json)
        File.rename(temporary.path, target)
      ensure
        File.delete?(temporary.path)
      end
    end
    File.write(receipts, "// Pinned assets. compiler.wasm.gz is the Observatory instrumented build.\nexport const ASSET_RECEIPTS = " + values.to_pretty_json + ";\n")
    puts "Installed browser compiler: #{File.size(target).format(delimiter: ',')} bytes gzipped"
  end
end
