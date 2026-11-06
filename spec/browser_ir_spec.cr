require "./scripts_spec_helper"
require "../scripts/support/browser_ir"

describe ObservatoryScripts::BrowserIR do
  it "streams LLVM output, marks only excluded definitions, and propagates opt failure" do
    ObservatoryScripts.temporary_directory do |root|
      opt = root / "opt"
      File.write(opt, <<-'SH'
        #!/bin/sh
        printf '%s\n' \
          'declare void @"pretty_print"()' \
          'define void @"*Crystal::ASTNode#pretty_print<PrettyPrint>:Nil"() {' \
          'define i1 @"*Crystal::MainVisitor#visit<Crystal::Yield>:Bool"() {' \
          'define i1 @"*Crystal::MainVisitor#visit<Crystal::Call>:Bool"() {'
        # More than a pipe buffer must be drained without accumulating all IR.
        awk 'BEGIN { for (i = 0; i < 10000; i++) print "; irrelevant LLVM line" }'
        exit 7
        SH
      )
      File.chmod(opt, 0o755)
      status = ObservatoryScripts::BrowserIR.prepare(opt.to_s, root)
      status.exit_code.should eq(7)
      File.read(root / "no-opt.csv").lines.should eq([
        "*Crystal::ASTNode#pretty_print<PrettyPrint>:Nil,optnone",
        "*Crystal::ASTNode#pretty_print<PrettyPrint>:Nil,noinline",
        "*Crystal::MainVisitor#visit<Crystal::Yield>:Bool,optnone",
        "*Crystal::MainVisitor#visit<Crystal::Yield>:Bool,noinline",
      ])
    end
  end
end
