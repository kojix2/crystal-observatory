// Application-owned text only; compiler output and source stay unchanged.
export const messages = {
  'app.title': {
    ja: 'Crystal Observatory — コンパイラを観察',
    en: 'Crystal Observatory — Compiler explorer',
  },
  'app.description': {
    ja: '実際のCrystalコンパイラのVisitor、型推論、AST変換、LLVM IRを観察。',
    en: 'Explore real Crystal compiler visitors, type inference, AST transformations and LLVM IR.',
  },
  run: {
    ja: '▶ コンパイルして実行',
    en: '▶ Compile & run',
  },
  'run.title': {
    ja: 'ブラウザ内でコンパイルして実行',
    en: 'Compile and run in the browser',
  },
  compile: {
    ja: 'コンパイル → IR',
    en: 'Compile → IR',
  },
  'compile.title': {
    ja: '意味解析・LLVM IR生成・WASMリンク',
    en: 'Analyze, generate LLVM IR and link WASM',
  },
  cancel: {
    ja: '■ 中止',
    en: '■ Stop',
  },
  sample: {
    ja: '初期コード',
    en: 'Initial code',
  },
  syntax: {
    ja: '構文解析のみ',
    en: 'Parse only',
  },
  'syntax.title': {
    ja: '軽量エンジンでLexer・Parserのみを実行',
    en: 'Run only the lexer and parser with the lightweight engine',
  },
  recorded: {
    ja: 'この例の記録',
    en: 'Example trace',
  },
  'recorded.title': {
    ja: '選択した例の収録済みトレースを開く',
    en: 'Open the recorded trace for this example',
  },
  file: {
    ja: 'ファイル',
    en: 'File',
  },
  import: {
    ja: '記録を開く…',
    en: 'Open trace…',
  },
  export: {
    ja: '記録をJSON保存',
    en: 'Save trace JSON',
  },
  reset: {
    ja: '配置をリセット',
    en: 'Reset layout',
  },
  help: {
    ja: '使い方',
    en: 'Help',
  },
  github: {
    ja: 'GitHub リポジトリ',
    en: 'GitHub repository',
  },
  language: {
    ja: '表示言語',
    en: 'Interface language',
  },
  close: {
    ja: '閉じる',
    en: 'Close',
  },
  commands: {
    ja: '入力と操作',
    en: 'Input and commands',
  },
  workspace: {
    ja: '解析ワークスペース',
    en: 'Analysis workspace',
  },
  source: {
    ja: 'ソース',
    en: 'Source',
  },
  'source.input': {
    ja: 'Crystalソースコード',
    en: 'Crystal source code',
  },
  inspector: {
    ja: '詳細',
    en: 'Inspector',
  },
  trace: {
    ja: '履歴',
    en: 'History',
  },
  'split.inspector': {
    ja: '観察と詳細の境界',
    en: 'Observation / inspector divider',
  },
  'split.trace': {
    ja: '履歴と観察の境界',
    en: 'History / observation divider',
  },
  dirty: {
    ja: '編集中 · 再解析が必要',
    en: 'Edited · recompile to update',
  },
  clean: {
    ja: '記録と一致',
    en: 'Matches trace',
  },
  restore: {
    ja: '元に戻す',
    en: 'Restore',
  },
  'restore.title': {
    ja: '表示中の記録のソースに戻す',
    en: 'Restore the source used by this trace',
  },
  views: {
    ja: '観察対象',
    en: 'Observation views',
  },
  types: {
    ja: '型の依存',
    en: 'Types',
  },
  execution: {
    ja: '実行結果',
    en: 'Output',
  },
  maximize: {
    ja: '観察パネルを最大化',
    en: 'Maximize observation',
  },
  unmaximize: {
    ja: '観察パネルを元に戻す (Esc)',
    en: 'Restore panels (Esc)',
  },
  snapshot: {
    ja: 'ASTスナップショット',
    en: 'AST snapshot',
  },
  follow: {
    ja: '追従',
    en: 'Follow',
  },
  'follow.title': {
    ja: '選択イベントの工程と型に追従',
    en: 'Follow the selected event’s stage and types',
  },
  expand: {
    ja: '展開',
    en: 'Expand',
  },
  'expand.title': {
    ja: 'すべてのASTノードを展開',
    en: 'Expand all AST nodes',
  },
  ast: {
    ja: '構文木',
    en: 'Syntax tree',
  },
  'ir.search': {
    ja: '関数名で検索',
    en: 'Find function',
  },
  'ir.function': {
    ja: 'LLVM関数',
    en: 'LLVM function',
  },
  'ir.download': {
    ja: 'LLVM IRを保存',
    en: 'Save LLVM IR',
  },
  rerun: {
    ja: '再実行',
    en: 'Run again',
  },
  'wasm.download': {
    ja: '生成したWASMを保存',
    en: 'Save generated WASM',
  },
  stdin: {
    ja: '標準入力',
    en: 'Standard input',
  },
  'stdin.hint': {
    ja: 'gets が読み取るテキスト',
    en: 'Text to be read by gets',
  },
  args: {
    ja: '引数（JSON配列）',
    en: 'Arguments (JSON array)',
  },
  'args.hint': {
    ja: '例: ["hello", "42"] · 10秒で停止',
    en: 'Example: ["hello", "42"] · 10 s limit',
  },
  output: {
    ja: 'プログラムの出力',
    en: 'Program output',
  },
  unknown: {
    ja: '未確定',
    en: 'Unknown',
  },
  unset: {
    ja: '未設定',
    en: 'Not set',
  },
  inferred: {
    ja: '推論された型',
    en: 'INFERRED TYPE',
  },
  'node.prev': {
    ja: '← 前の訪問',
    en: '← Previous visit',
  },
  'node.next': {
    ja: '次の訪問 →',
    en: 'Next visit →',
  },
  'node.filter': {
    ja: 'このノードのみ',
    en: 'Only this node',
  },
  'node.source': {
    ja: 'NODE / SOURCE',
    en: 'NODE / SOURCE',
  },
  stack: {
    ja: 'VISIT STACK',
    en: 'VISIT STACK',
  },
  'user.only': {
    ja: 'ユーザーソースのみ',
    en: 'User source only',
  },
  'compiler.source': {
    ja: 'COMPILER SOURCE',
    en: 'COMPILER SOURCE',
  },
  first: {
    ja: '先頭',
    en: 'First event',
  },
  prev: {
    ja: '前へ',
    en: 'Previous event',
  },
  next: {
    ja: '次へ',
    en: 'Next event',
  },
  play: {
    ja: '再生',
    en: 'Play',
  },
  pause: {
    ja: '停止',
    en: 'Pause',
  },
  speed: {
    ja: '再生速度',
    en: 'Playback speed',
  },
  slow: {
    ja: '低速',
    en: 'Slow',
  },
  normal: {
    ja: '標準',
    en: 'Normal',
  },
  fast: {
    ja: '高速',
    en: 'Fast',
  },
  position: {
    ja: 'イベント位置',
    en: 'Event position',
  },
  'next.type': {
    ja: '次の型',
    en: 'Next type',
  },
  'next.rewrite': {
    ja: '次の変換',
    en: 'Next rewrite',
  },
  'next.phase': {
    ja: '次の工程',
    en: 'Next stage',
  },
  'trace.collapse': {
    ja: '履歴を折りたたむ',
    en: 'Collapse trace',
  },
  'trace.expand': {
    ja: '履歴を広げる',
    en: 'Expand trace',
  },
  'event.search': {
    ja: 'Visitor・ノード・型を検索',
    en: 'Find visitor, node or type',
  },
  'event.kind': {
    ja: 'イベント種別',
    en: 'Event kind',
  },
  'event.all': {
    ja: 'すべての操作',
    en: 'All events',
  },
  clear: {
    ja: '解除',
    en: 'Clear',
  },
  'event.column': {
    ja: 'Visitor / ノード',
    en: 'Visitor / node',
  },
  'result.column': {
    ja: '操作 / 結果',
    en: 'Event / result',
  },
  keys: {
    ja: '← → ステップ · Space 再生',
    en: '← → step · Space play',
  },
  'layout.hint': {
    ja: '境界をドラッグして幅を調整',
    en: 'Drag dividers to resize',
  },
  'status.detail': {
    ja: '状態・診断の詳細',
    en: 'Status and diagnostics',
  },
  'guide.title': {
    ja: '自分のコードで、コンパイラを観察する',
    en: 'Explore the compiler with your own code',
  },
  'guide.intro': {
    ja: 'ソースを編集して「コンパイルして実行」を押すと、実際のCrystalとLLVMがブラウザ内で動き、LLDがWASMをリンクして実行します。',
    en: 'Edit the Source tab and choose Compile & run. The actual Crystal compiler and LLVM run in your browser; LLD links the WASM program before execution.',
  },
  'guide.step1': {
    ja: 'ソースタブで初期コードを選ぶか、自分のコードを書きます。「この例の記録」は選択した例の保存済み履歴を開きます。',
    en: 'Choose initial code in Source, or write your own. Example trace opens a saved recording for the selected example.',
  },
  'guide.step2': {
    ja: 'コンパイルして実行／コンパイル → IR／構文解析のみ、から目的に合う操作を選びます。',
    en: 'Choose Compile & run, Compile → IR, or Parse only.',
  },
  'guide.step3': {
    ja: '左の履歴でイベントを選ぶと、中央にASTなど、右上にノード、右下にVisitorの役割と今回の操作が表示されます。',
    en: 'Select an event in History. Inspect its AST in the center, its node at the upper right, and the visitor role and operation below.',
  },
  'guide.step4': {
    ja: '記録の読み込み・JSON保存は履歴パネル、標準入力・引数・再実行は実行結果タブで行います。',
    en: 'Open or save traces in History. Set stdin and arguments, or rerun a compiled program, in Output.',
  },
  'guide.layout.title': {
    ja: '画面と表示言語',
    en: 'Layout and language',
  },
  'guide.layout': {
    ja: '3列の境界と、右側の上下境界をドラッグして調整できます。境界にフォーカスして矢印キーでも調整でき、Homeで初期値に戻ります。最大化はEscで解除します。初期言語は英語。JA / ENの明示的な選択は保存されます。',
    en: 'Drag the column dividers or the horizontal inspector divider. Focus a divider and use arrow keys, or Home to reset it. Escape exits maximized view. English is the default; an explicit JA / EN preference is saved.',
  },
  'guide.runtime.title': {
    ja: '実行環境',
    en: 'Runtime',
  },
  'guide.runtime': {
    ja: '初回にコンパイラ・LLVM・LLD・標準ライブラリを読み込みます。静的HTTPサーバーやGitHub Pagesで動作し、入力コードは送信しません。WebAssembly例外処理に対応したブラウザが必要です。',
    en: 'The first run loads the compiler, LLVM, LLD and standard library. A static HTTP server or GitHub Pages is enough. Source code is not uploaded. The browser must support WebAssembly exception handling.',
  },
  'guide.limits': {
    ja: '実行先はWASIです。OSプロセス、ソケット、ネイティブshard、ホストのファイルにはアクセスできません。プログラムのメモリ上限は256 MiB、実行時間は10秒です。',
    en: 'Programs target WASI. OS processes, sockets, native shards and host files are unavailable. Program memory is limited to 256 MiB and execution to 10 seconds.',
  },
  'guide.reading.title': {
    ja: '記録の読み方',
    en: 'Reading the trace',
  },
  'guide.reading': {
    ja: 'ASTは工程終了・展開・呼出し解決時のスナップショットです。型の依存とVisitorスタックは選択イベント時点を再現します。IR挿入位置には子ノードが生成した命令も含まれます。収録記録は過去の実測値、構文解析は軽量な別エンジンです。コード、コンパイラの診断、内部の識別子は原文のまま表示します。',
    en: 'ASTs are snapshots taken after stages, expansions and call resolution. Type dependencies and the visitor stack reflect the selected event. IR insertion positions include instructions emitted by children. Recorded traces are historical measurements; Syntax uses a separate lightweight engine. Code, compiler diagnostics and internal identifiers remain unchanged.',
  },
  'event.visit_enter': {
    ja: '訪問 →',
    en: 'Visit →',
  },
  'event.visit_leave': {
    ja: '← 戻る',
    en: '← Return',
  },
  'event.transform_enter': {
    ja: '変換 →',
    en: 'Transform →',
  },
  'event.transform_leave': {
    ja: '← 戻る',
    en: '← Return',
  },
  'event.type': {
    ja: '型の変化',
    en: 'Type change',
  },
  'event.bind': {
    ja: '依存を登録',
    en: 'Bind',
  },
  'event.unbind': {
    ja: '依存を解除',
    en: 'Unbind',
  },
  'event.rewrite': {
    ja: 'AST変換',
    en: 'Rewrite',
  },
  'event.expand': {
    ja: '展開',
    en: 'Expand',
  },
  'event.dispatch': {
    ja: 'メソッド解決',
    en: 'Resolve call',
  },
  'event.ir': {
    ja: 'IR挿入先',
    en: 'IR position',
  },
  'event.phase_enter': {
    ja: '工程開始',
    en: 'Stage start',
  },
  'event.phase_leave': {
    ja: '工程終了',
    en: 'Stage end',
  },
  'event.complete': {
    ja: '完了',
    en: 'Complete',
  },
  'event.error': {
    ja: 'エラー',
    en: 'Error',
  },
  'explain.empty': {
    ja: '左の履歴からイベントを選ぶと、Visitorの役割と今回の操作が表示されます。',
    en: 'Select an event in History to see the visitor’s role and the operation it performed.',
  },
  'explain.declaration': {
    ja: '宣言の式自体の型がNilになりました。これはメソッド呼び出しの戻り値の型ではありません。',
    en: 'The declaration expression has type Nil. This is not the return type of calling the method.',
  },
  'explain.type': {
    ja: '型が「{before}」から「{after}」に変わりました。依存先の型が変わると再計算されることがあります。',
    en: 'The type changed from {before} to {after}. Changes to dependencies can trigger recalculation.',
  },
  'explain.bind': {
    ja: 'ノード #{node} が #{related} の型に依存します。情報は #{related} → #{node} に伝わります。',
    en: 'Node #{node} depends on the type of #{related}. Type information flows from #{related} to #{node}.',
  },
  'explain.unbind': {
    ja: '型の依存関係を解除しました。',
    en: 'A type dependency was removed.',
  },
  'explain.expand': {
    ja: '展開したASTを元のノードに結び付けました。元のコードと生成コードを比較できます。',
    en: 'The expanded AST is attached to the original node. Compare the source and generated code.',
  },
  'explain.dispatch': {
    ja: '呼出し先を具体化しました：{after}。関連ノード #{related} が型付きメソッドです。',
    en: 'The call resolves to {after}. Related node #{related} is the typed method.',
  },
  'explain.rewrite': {
    ja: '{visitor} がASTを変換しました。前後のコードとノードIDを比較できます。同じオブジェクトの変更も記録します。',
    en: '{visitor} transformed the AST. Compare code and node IDs before and after; in-place changes are recorded too.',
  },
  'explain.ir': {
    ja: 'CodeGenVisitorの訪問終了時のLLVM Builder挿入先です。子ノードが生成した命令も含まれます。',
    en: 'The LLVM Builder insertion point after this CodeGenVisitor visit. It includes instructions emitted by child nodes.',
  },
  'explain.top': {
    ja: 'クラス・メソッド・マクロなどの宣言を登録します。すべてのメソッド本体を型推論する段階ではありません。',
    en: 'Registers class, method and macro declarations. It does not infer every method body at this stage.',
  },
  'explain.main': {
    ja: '到達する式と呼び出しを解析します。引数の型に応じてメソッドを具体化し、型の依存関係を結びます。',
    en: 'Analyzes reachable expressions and calls. Methods are specialized for argument types and type dependencies are connected.',
  },
  'explain.codegen': {
    ja: '型付きASTからLLVMの命令・基本ブロック・関数を生成します。',
    en: 'Visits the typed AST to generate LLVM instructions, basic blocks and functions.',
  },
  'explain.syntax': {
    ja: '構文木を観察するVisitorです。この巡回は型推論を行いません。',
    en: 'A visitor for inspecting syntax. This traversal does not perform type inference.',
  },
  'explain.visit': {
    ja: '{visitor} がノード #{node} に入りました。visit_anyとvisitの戻り値で子の自動巡回が決まります。',
    en: '{visitor} entered node #{node}. The return values of visit_any and visit determine automatic child traversal.',
  },
  'explain.leave': {
    ja: '{visitor} によるノード #{node} の訪問・変換から戻りました。別の工程で同じノードを再訪する場合があります。',
    en: '{visitor} returned from visiting or transforming node #{node}. Other passes may visit this node again.',
  },
  'explain.transform': {
    ja: '{visitor} が変換対象を受け取りました。子の変換や新しいノードへの置換を行います。',
    en: '{visitor} received a node to transform. Children may be transformed and nodes may be replaced.',
  },
  'explain.complete': {
    ja: 'コンパイラの処理が完了しました。',
    en: 'Compiler processing completed.',
  },
  'explain.phase': {
    ja: '{phase} の実測イベントです。',
    en: 'A measured event in {phase}.',
  },
  'node.selected': {
    ja: '選択したノードです。「次の訪問」で、このノードが処理される位置に移動できます。',
    en: 'This node is selected. Next visit jumps to the next event that processes it.',
  },
  'node.events': {
    ja: 'NODE #{id} · {count} 件',
    en: 'NODE #{id} · {count} events',
  },
  'link.wasi': {
    ja: 'Crystal 1.22.0へのリンク。WASIパッチの取得先はdeps/sources.lock.json。',
    en: 'Links to Crystal 1.22.0. WASI patches are pinned in deps/sources.lock.json.',
  },
  'link.upstream': {
    ja: 'リンク先は現在のmaster。固定ソースはmake syntax-depsで取得できます。',
    en: 'Links to current master. Restore the pinned source with make syntax-deps.',
  },
  'link.syntax': {
    ja: 'syntax/visitor.cr（make syntax-depsでソース取得）',
    en: 'syntax/visitor.cr (restore source with make syntax-deps)',
  },
  'ir.none': {
    ja: 'この記録にはLLVM IRがありません。\n「コンパイル → IR」で生成します。',
    en: 'This trace has no LLVM IR.\nUse Compile → IR to generate it.',
  },
  'ir.noMatch': {
    ja: '一致する関数がありません。',
    en: 'No matching functions.',
  },
  'ir.caption': {
    ja: '{count} functions · 最適化前 · .ll全体を保存可能',
    en: '{count} functions · unoptimized · full .ll available',
  },
  'ir.prompt': {
    ja: '「コンパイル → IR」で入力コードのIRを生成します。',
    en: 'Use Compile → IR to generate IR from your source.',
  },
  'graph.empty': {
    ja: 'ASTがまだ作成されていません。',
    en: 'No AST yet.',
  },
  'graph.prompt': {
    ja: '入力コードを解析するとASTが表示されます。',
    en: 'Compile or parse the source to inspect its AST.',
  },
  'graph.node': {
    ja: '{kind} {type} ノード {id}',
    en: '{kind} {type}, node {id}',
  },
  'graph.caption': {
    ja: '{name} · {count} nodes · {time}{outside}',
    en: '{name} · {count} nodes · {time}{outside}',
  },
  'graph.eventTypes': {
    ja: '選択イベント時点の型',
    en: 'types at selected event',
  },
  'graph.snapshotTypes': {
    ja: 'スナップショット時点の型',
    en: 'types at snapshot',
  },
  'graph.outside': {
    ja: ' · 選択ノードは範囲外',
    en: ' · selected node outside snapshot',
  },
  'graph.noEdges': {
    ja: 'この時点では、選択ノードの型の依存関係が記録されていません。\n\n「次の型」または履歴の「依存を登録」を選んでください。',
    en: 'No recorded type dependencies for this node at this point.\n\nUse Next type or select a Bind event in the trace.',
  },
  'graph.edges': {
    ja: '型の依存先 → 選択ノード → 型を参照する側\n矢印は型情報の伝わる向きです。',
    en: 'Dependencies → selected node → dependents\nArrows show the flow of type information.',
  },
  'graph.edgeCount': {
    ja: 'イベント {event} · {count} 関係 · 選択ノードの隣接関係',
    en: 'Event {event} · {count} edges · neighbors of selected node',
  },
  'graph.runCaption': {
    ja: '生成WASMを独立Workerで実行 · ホストファイルへのアクセスなし',
    en: 'Generated WASM runs in its own worker · no host file access',
  },
  'graph.tokenCaption': {
    ja: 'Parserが読んだ実際のToken。同じ位置・種別・値の重複は除去。',
    en: 'Actual parser tokens; duplicates with the same position, kind and value are omitted.',
  },
  'token.position': {
    ja: '位置',
    en: 'Position',
  },
  'token.kind': {
    ja: '種別',
    en: 'Kind',
  },
  'token.value': {
    ja: '値',
    en: 'Value',
  },
  'token.mode': {
    ja: 'モード',
    en: 'Mode',
  },
  'count.events': {
    ja: '{count} 件',
    en: '{count} events',
  },
  'count.trace': {
    ja: '{events} events · {nodes} nodes',
    en: '{events} events · {nodes} nodes',
  },
  'engine.live': {
    ja: 'WASM · Crystal + LLVM + LLD',
    en: 'WASM · Crystal + LLVM + LLD',
  },
  'engine.recorded': {
    ja: '収録済みトレース',
    en: 'Recorded trace',
  },
  'engine.empty': {
    ja: 'ブラウザ内コンパイラ',
    en: 'Browser compiler',
  },
  'engine.syntax': {
    ja: 'WASM · 構文解析',
    en: 'WASM · syntax',
  },
  'engine.progress': {
    ja: 'WASM読込 {percent}%',
    en: 'Loading WASM {percent}%',
  },
  'origin.input': {
    ja: '入力コード',
    en: 'Source input',
  },
  'origin.live': {
    ja: 'ブラウザ内コンパイル',
    en: 'In-browser compilation',
  },
  'origin.syntax': {
    ja: 'ブラウザ内の構文解析',
    en: 'In-browser syntax analysis',
  },
  'origin.recorded': {
    ja: '収録記録: {title}',
    en: 'Recorded: {title}',
  },
  'state.idle': {
    ja: '未実行',
    en: 'Not run',
  },
  'state.cancelled': {
    ja: '中止',
    en: 'Stopped',
  },
  'state.failed': {
    ja: '処理失敗',
    en: 'Failed',
  },
  'state.compiling': {
    ja: 'コンパイル中',
    en: 'Compiling',
  },
  'state.compileFailed': {
    ja: 'コンパイル失敗',
    en: 'Compilation failed',
  },
  'state.parsing': {
    ja: '構文解析中',
    en: 'Parsing',
  },
  'state.syntaxError': {
    ja: '構文エラー',
    en: 'Syntax error',
  },
  'state.syntax': {
    ja: '構文解析のみ',
    en: 'Syntax only',
  },
  'state.running': {
    ja: '実行中',
    en: 'Running',
  },
  'state.loading': {
    ja: '記録を読込中',
    en: 'Loading trace',
  },
  'state.recorded': {
    ja: '収録記録 · 実行ファイルなし',
    en: 'Recorded trace · no executable',
  },
  'state.timings': {
    ja: 'コンパイル {compile}s · リンク {link}s',
    en: 'Compile {compile}s · link {link}s',
  },
  'state.exit': {
    ja: '終了コード {code} · {seconds}s',
    en: 'Exit code {code} · {seconds}s',
  },
  'state.waiting': {
    ja: '解析待ち',
    en: 'Ready to analyze',
  },
  'notice.cancelled': {
    ja: '処理を中止しました。',
    en: 'Operation stopped.',
  },
  'notice.changed': {
    ja: '解析中にソースが変わりました。記録は変更前のコードです。再解析してください。',
    en: 'Source changed during analysis. This trace is for the earlier code; recompile to update it.',
  },
  'notice.prepare': {
    ja: 'ブラウザ内コンパイラを準備中。初回はWASMと標準ライブラリを読み込みます…',
    en: 'Preparing the browser compiler. The first run loads WASM and the standard library…',
  },
  'notice.loading': {
    ja: 'コンパイラ資材を読み込み中… {detail}',
    en: 'Loading compiler assets… {detail}',
  },
  'notice.compiling': {
    ja: 'Crystal + LLVM が解析・コード生成中…',
    en: 'Crystal + LLVM are analyzing and generating code…',
  },
  'notice.linking': {
    ja: 'LLDがWASMをリンク中…',
    en: 'LLD is linking WASM…',
  },
  'notice.parsing': {
    ja: 'Crystal WASMがLexer・Parser・観察用Visitorを実行中…',
    en: 'Crystal WASM is running the lexer, parser and observation visitor…',
  },
  'notice.needCompile': {
    ja: '現在のソースを先にコンパイルしてください。',
    en: 'Compile the current source first.',
  },
  'notice.args': {
    ja: '引数は文字列のJSON配列にしてください。例: ["hello", "42"]',
    en: 'Arguments must be a JSON array of strings, e.g. ["hello", "42"].',
  },
  'notice.executed': {
    ja: 'ブラウザ内でコンパイル・リンク・実行しました。終了コード {code}。',
    en: 'Compiled, linked and executed in the browser. Exit code {code}.',
  },
  'notice.recordLoading': {
    ja: '実コンパイラの記録を読み込み中…',
    en: 'Loading a real compiler trace…',
  },
  'notice.serving': {
    ja: '{error} HTTPサーバーまたはGitHub Pagesから開いてください。',
    en: '{error} Open this app through an HTTP server or GitHub Pages.',
  },
  'notice.truncated': {
    ja: '記録上限に達しました。以後のイベントは含まれません。',
    en: 'The trace limit was reached. Later events were omitted.',
  },
  'notice.compiled': {
    ja: '入力ソースをブラウザ内の実コンパイラとLLVMで解析しました。',
    en: 'Analyzed your source using the real Crystal compiler and LLVM in the browser.',
  },
  'notice.input': {
    ja: '「コンパイルして実行」で、このコードをブラウザ内で実行します。',
    en: 'Choose Compile & run to execute this source in the browser.',
  },
  'notice.recorded': {
    ja: '{origin} · 収録済みの実測記録です。',
    en: '{origin} · a previously recorded compiler trace.',
  },
  'notice.syntax': {
    ja: '{origin} · 実際のCrystal Lexer / Parserによる結果です。',
    en: '{origin} · results from the real Crystal lexer and parser.',
  },
  'notice.noNext': {
    ja: 'この先に該当するイベントはありません。',
    en: 'No further matching events.',
  },
  'error.sourceLimit': {
    ja: 'ソースは256 KiB以内にしてください。',
    en: 'Source must be at most 256 KiB.',
  },
  'error.traceLimit': {
    ja: '50 MiB以下の記録を開いてください。',
    en: 'Open a trace no larger than 50 MiB.',
  },
  'error.traceInflated': {
    ja: '展開後の記録が50 MiBを超えます。',
    en: 'Decompressed trace exceeds 50 MiB.',
  },
  'error.traceFetch': {
    ja: '記録を取得できません ({status})',
    en: 'Could not fetch trace ({status})',
  },
  'error.timeout': {
    ja: '{seconds}秒で処理を停止しました。',
    en: 'Stopped after {seconds} seconds.',
  },
  'error.worker': {
    ja: 'Workerの実行エラー',
    en: 'Worker execution failed',
  },
  'error.workerResult': {
    ja: 'Workerの結果を読み取れません。',
    en: 'Could not decode the worker result.',
  },
  'error.output': {
    ja: '出力が256 KiBに達したため実行を中止しました。',
    en: 'Execution stopped because output exceeded 256 KiB.',
  },
  'error.syntaxWasm': {
    ja: 'syntax.wasm がありません。make wasmで生成してください。',
    en: 'syntax.wasm is missing. Run make wasm to build it.',
  },
  'error.manifest': {
    ja: '入力例の一覧を取得できません。',
    en: 'Could not load the examples.',
  },
  'example.01': {
    ja: '01 · メソッドの具体化',
    en: '01 · Method specialization',
  },
  'example.02': {
    ja: '02 · Unionと型の絞り込み',
    en: '02 · Union types and narrowing',
  },
  'example.03': {
    ja: '03 · マクロから生まれるAST',
    en: '03 · Macro-generated AST',
  },
  'example.04': {
    ja: '04 · Normalizerの仕事',
    en: '04 · Normalization',
  },
  'example.05': {
    ja: '05 · オーバーロードの選択',
    en: '05 · Overload resolution',
  },
  'example.06': {
    ja: '06 · 呼ばれないメソッドとCleanup',
    en: '06 · Unused methods and cleanup',
  },
  'example.07': {
    ja: '07 · structとinitialize',
    en: '07 · Structs and initialize',
  },
  'example.08': {
    ja: '08 · 型エラーの直前まで',
    en: '08 · Before a type error',
  },
  'error.traceSchema': {
    ja: '対応するトレースJSONではありません。',
    en: 'Unsupported trace JSON.',
  },
  'error.traceSize': {
    ja: 'トレースが大きすぎます。',
    en: 'Trace is too large.',
  },
  'error.traceOrder': {
    ja: 'イベント順序が不正です。',
    en: 'Invalid event order.',
  },
  'error.traceNode': {
    ja: 'ノードIDが不正です。',
    en: 'Invalid node IDs.',
  },
  'error.traceReference': {
    ja: '未定義ノードへの参照です。',
    en: 'Reference to an undefined node.',
  },
  'error.traceAST': {
    ja: 'ASTの形式が不正です。',
    en: 'Invalid AST format.',
  },
  'error.traceEdge': {
    ja: 'ASTの辺に不正な参照があります。',
    en: 'Invalid reference in an AST edge.',
  },
  'split.details': {
    ja: 'ノード詳細と操作詳細の境界',
    en: 'Node / operation divider',
  },
  'node.details': {
    ja: 'ノードの詳細',
    en: 'Node details',
  },
  'event.details': {
    ja: 'Visitor・操作の詳細',
    en: 'Visitor & operation',
  },
  'visitor.role': {
    ja: '役割',
    en: 'ROLE',
  },
  'event.operation': {
    ja: '今回の操作',
    en: 'THIS OPERATION',
  },
  'event.raw': {
    ja: '記録された補足情報',
    en: 'Recorded detail',
  },
  'event.target': {
    ja: '対象ノード #{id} · {kind}',
    en: 'Target node #{id} · {kind}',
  },
  'event.phase': {
    ja: '工程: {phase}',
    en: 'Stage: {phase}',
  },
  'event.noVisitor': {
    ja: 'コンパイラの工程',
    en: 'Compiler stage',
  },
  'node.empty': {
    ja: 'ノードを選択してください',
    en: 'Select a node',
  },
  'node.summary': {
    ja: 'この記録内のイベント: {count}件。ASTまたは履歴から対象を変更できます。',
    en: '{count} events in this trace. Select a node in the AST or follow the history.',
  },
  before: {
    ja: '変化前',
    en: 'BEFORE',
  },
  after: {
    ja: '変化後',
    en: 'AFTER',
  },
  'source.custom': {
    ja: '自分のコード',
    en: 'Custom code',
  },
  'source.ready': {
    ja: '解析するコードを編集できます',
    en: 'Ready to compile',
  },
  'source.caption': {
    ja: '初期コードを選ぶか自由に編集し、上の操作で解析・実行します。',
    en: 'Choose initial code or edit freely, then compile or parse from the toolbar.',
  },
  'visitor.TopLevelVisitor': {
    ja: 'クラス・メソッド・マクロなどの宣言を登録します。呼ばれていないメソッド本体まで型推論する工程ではありません。',
    en: 'Registers classes, methods and macros so later passes can resolve declarations. It does not infer every unused method body.',
  },
  'visitor.MainVisitor': {
    ja: '式や呼び出しを解析し、型の依存関係を結びます。引数型に応じたメソッドの具体化も担当します。',
    en: 'Analyzes expressions and calls, connects type dependencies, and specializes methods for their argument types.',
  },
  'visitor.Normalizer': {
    ja: '+=やunlessなどの構文を、後続の意味解析で扱う基本的なASTへ変換します。',
    en: 'Rewrites syntax such as += and unless into simpler AST forms for subsequent semantic analysis.',
  },
  'visitor.CleanupTransformer': {
    ja: '型推論後のASTを整理します。確定した条件や不要な式を簡略化し、コード生成へ渡す構造を整えます。',
    en: 'Cleans the typed AST before code generation, simplifying known conditions and unnecessary expressions.',
  },
  'visitor.CodeGenVisitor': {
    ja: '型付きASTを訪問し、LLVMの関数・基本ブロック・命令を生成します。',
    en: 'Visits the typed AST and emits LLVM functions, basic blocks and instructions.',
  },
  'visitor.TypeDeclarationVisitor': {
    ja: '変数の型宣言、Cの構造体や共用体のフィールド、funやaliasの宣言を、メインの意味解析より先に解決します。',
    en: 'Resolves variable type declarations, C struct/union fields, fun declarations and aliases before main semantic analysis.',
  },
  'visitor.TypeGuessVisitor': {
    ja: '代入を調べて、インスタンス変数やクラス変数の型を推測します。',
    en: 'Inspects assignments to infer possible types for instance and class variables.',
  },
  'visitor.InstanceVarsInitializerVisitor': {
    ja: 'インスタンス変数の初期化式を、インスタンスがメインのコードで使われる前に解析します。',
    en: 'Analyzes instance-variable initializers before instances are used by the main program.',
  },
  'visitor.ClassVarsInitializerVisitor': {
    ja: 'クラス変数の初期化式を解析し、型と初期化処理を整えます。',
    en: 'Analyzes class-variable initializers and their types.',
  },
  'visitor.RestrictionsAugmenter': {
    ja: '変数への代入と宣言された型の制約を調べ、適用可能な引数の型制約を補います。条件付きの代入では適用できない場合があります。',
    en: 'Uses assignments and declared variable types to augment applicable argument restrictions. Conditional assignments may prevent this.',
  },
  'visitor.FixMissingTypes': {
    ja: '意味解析後のノードや型付きメソッドを巡回し、コード生成までに必要な型情報の不足を補います。',
    en: 'Traverses analyzed nodes and typed methods to complete type information needed before code generation.',
  },
  'visitor.MacroInterpreter': {
    ja: 'コンパイル時のマクロ式を評価し、展開に使われるコードを作ります。プログラム実行時の処理とは別です。',
    en: 'Evaluates compile-time macro expressions to produce expansion code. This is separate from running the program.',
  },
  'visitor.ToSVisitor': {
    ja: 'ASTをCrystalのコード表現へ変換します。自身では型推論やLLVM命令生成を行いません。',
    en: 'Renders AST nodes as Crystal source text. It does not itself infer types or emit LLVM instructions.',
  },
  'visitor.HasSelfVisitor': {
    ja: '式がselfを参照するかどうかを調べる補助Visitorです。',
    en: 'A helper visitor that checks whether an expression refers to self.',
  },
  'visitor.SyntaxWalkVisitor': {
    ja: '構文木を観察するためのアプリ独自のVisitorです。コンパイラ本来の意味解析工程ではなく、型推論は行いません。',
    en: 'The app’s inspection visitor walks syntax without type inference. It is not a compiler semantic pass.',
  },
  'visitor.ASTNode': {
    ja: 'ASTノードの型とobserver関係を管理するフックです。この項目はVisitorの訪問ではなく、型や依存の変更を記録しています。',
    en: 'An AST callback records type or observer changes. This entry describes a callback, not a visitor traversal.',
  },
  'visitor.Call': {
    ja: '呼び出しの展開や再計算を行うフックです。マクロ展開結果や具体化された呼び出し先との対応を記録します。',
    en: 'A call callback records expansion or recalculation, including expanded syntax and specialized target methods.',
  },
  'visitor.ExpandableNode': {
    ja: '展開可能なノードに生成されたASTを取り付けるフックです。文字列補間などが、展開先の式に結び付けられます。',
    en: 'A callback attaches generated AST to an expandable node, linking constructs such as string interpolation to their expanded expression.',
  },
  'visitor.stage': {
    ja: 'コンパイラ全体の工程の開始・終了や診断を記録しています。特定のVisitorへの訪問ではありません。',
    en: 'Records a compiler stage boundary, completion or diagnostic rather than a visit by a specific visitor.',
  },
  'visitor.unknown': {
    ja: 'この処理のイベントが記録されています。役割の説明は未登録です。下の実測操作とソースを確認してください。',
    en: 'An event from this compiler component was recorded. No role description is registered; inspect the measured operation and source below.',
  },
};
