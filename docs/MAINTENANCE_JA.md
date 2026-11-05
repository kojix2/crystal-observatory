# 保守ガイド

この版はブラウザ内コンパイルを維持したまま、処理の所有者を整理しています。トレースJSONはschema 1です。Web画面は左に履歴、中央にSource/AST等のタブ、右にノード詳細とVisitor/操作詳細を上下配置しています。上部バーは40pxの1行で、工程タブ列はありません。英語を初期値とし、JA/ENの明示的な選択を保存します。`web/`だけを静的配信でき、JavaScriptのバンドル工程は不要です。

## 変更する場所

| 変更したいこと | 担当する場所 | 境界 |
|---|---|---|
| 依存の取得・準備 | `deps/sources.lock.json`, `scripts/fetch_sources.py`, `scripts/prepare-web.mjs` | 上流コードをGitで二重管理しない。詳細はDEPENDENCIES_JA.md |
| 起動時の組み立て | `web/app.js` | Applicationとレイアウトの接続のみ |
| 解析・実行・記録を開く操作 | `web/ui/application.js` | ユーザー操作を調整。Workerを直接生成しない |
| 再生位置・ノード選択・表示タブ | `web/ui/trace-view.js` | 記録の表示。コンパイラを起動しない |
| 個々の表示 | `web/ui/source-editor.js`, `graphs.js`, `inspector.js`, `event-list.js`, `ir-view.js`, `tokens.js` | コンパイルやWorkerの状態を持たない |
| 色分け | `web/core/crystal-highlight.js`, `scripts/prepare-web.mjs` | npmで固定したPrismのCrystal文法を使用。型や診断の判定には使わない |
| 詳細の説明 | `web/ui/event-labels.js`, `web/i18n/messages.js` | Visitorの一般的な役割とイベントの実測値を分離。未登録の役割は推測せず表示 |
| 画面配置 | `web/ui/workspace.js`, `web/style.css` | 記録やコンパイラとは独立 |
| 幅の配分・最小幅 | `web/core/layout.js` | DOM非依存。4列の比率と隣接ペインのリサイズ |
| 翻訳辞書・エラーキー | `web/i18n/messages.js`, `index.js` | JA/ENを同じキーで管理。DOM・ストレージ非依存 |
| 言語設定・表示の再描画 | `web/ui/language.js` | data-i18n属性・状態文の更新と設定保存。記録を再読み込みしない |
| 記録の検証・巻き戻し | `web/core/trace-model.js` | DOM・Worker・fetchに依存しない |
| JSON/gzip入力 | `web/core/trace-io.js` | サイズ制限とデコード。表示の変更は呼び出し側 |
| 時間・出力・メモリ上限 | `web/core/limits.js` | ブラウザ側の上限を集約。入力上限はCrystal側にも存在 |
| 非同期操作の競合・中止 | `web/runtime/session.js` | 解析・構文・実行・記録読み込みを一つずつ実行 |
| Workerの生成・終了・期限 | `web/runtime/worker-client.js` | ハンドラ・タイマー・Promiseの終了を一か所で管理 |
| Workerの入口 | `web/workers/` | メッセージと処理モジュールの変換のみ |
| コンパイルとリンク | `web/runtime/compiler-pipeline.js`, `linker-args.js` | メモリ内ファイルでコンパイラとLLDを接続 |
| WASIコマンドの実行 | `web/runtime/wasi-command.js` | WASIホスト、標準入出力、メモリ内ファイル |
| 圧縮資材の取得・検証 | `web/runtime/assets.js`, `loader.js`, `asset-receipts.js`, `sha256.js` | ハッシュ確認後に展開し、Moduleを作成 |
| バイナリ資材 | `web/assets/compiler/`, `web/syntax.wasm` | 再ビルドまたは固定した上流資材から生成 |
| 未改変のWASIホスト | `web/vendor/browser_wasi_shim/` | 上流コードをそのまま保持 |
| 全工程コンパイル | `src/lab/compilation.cr` | Recorderの寿命、意味解析、LLVM検証・出力・診断 |
| WASIの入出力と設定 | `src/browser_trace.cr` | 入力・ターゲット設定・結果の書き出し |
| 観測フック | `src/lab/hooks.cr`, `full_hooks.cr` | `previous_def`で元の動作を保ち、結果を記録 |

## 非同期処理の約束

`WorkSession`が同時に持つ操作は一つです。操作を切り替えると古いWorkerを停止するか、記録のfetchをAbortします。JSONの展開のように途中で止められない処理でも、完了時に同じ操作かを確かめ、古い結果を返しません。

`WorkerClient`だけがWorkerのイベントハンドラ、タイマー、終了処理を管理します。コンパイラWorkerは成功後に再利用しますが、WASMのインスタンスは各解析で新規に作成します。キャッシュするのはModuleと標準ライブラリ等です。構文解析Workerと生成プログラムのWorkerは使い捨てです。プログラムの中止だけで、待機中のコンパイラ資材まで捨てないようにしています。

Workerは途中経過として`status`、`progress`、`output`を返し、終了時には`trace`または`done`、失敗時には`error`を返します。アプリ固有の`UIError`は`errorKey`と`errorValues`も渡し、受信側で現在の言語へ変換します。コンパイラの診断文字列はそのまま表示します。メッセージ形式を増やす場合は、WorkerClientの終了判定とテストも更新してください。

Applicationは生成したWASMとその入力ソースを一緒に保存します。処理中に編集された入力は結果で上書きしません。ソースが一致しないWASMは自動実行・再実行しません。入力例のソースはmanifestから直接読み、収録済みの巨大なLLVM記録を取得するのは「収録記録」を押したときだけです。

## レイアウトと表示言語

`core/layout.js`が4列の比率（22 / 36 / 18 / 24）と最小幅（170 / 260 / 180 / 240 px）を扱います。`workspace.js`が実際の幅を測定し、ドラッグ・キーボード・最大化・折りたたみを接続します。旧版は履歴の**高さ**を保存していたため、新しい保存キー`crystal-observatory.workspace.v2`で列幅と区別しています。

固定ラベルにはHTMLの`data-i18n`、ツールチップには`data-i18n-title`、aria-labelには`data-i18n-aria`を使います。動的な文は`text(id, () => t(key, values))`または`notify(() => t(key, values))`で登録すると、言語変更後も翻訳できます。登録先は固定IDで上書きされ、履歴を蓄積しません。

言語切替時の`TraceView.localize()`は現在の記録から表示を描き直します。`load()`や`seek()`を呼ぶと手動で選んだノード・スナップショット・フィルタが変わるため、呼びません。ライブ解析かどうかも表示文字列の比較ではなく、明示的な`live`値で渡します。翻訳を追加するときは両言語とプレースホルダーをそろえ、`spec/i18n.test.mjs`を実行してください。

## 残した回避策

| 箇所 | 必要な理由 | 変更・撤去時の確認 |
|---|---|---|
| `src/lab/full_hooks.cr`の`Crystal::Type#to_s : String` | 型を観測する呼び出しが、コンパイラ自身の戻り値型推論を循環させる | 明示型なしで全工程WASMをビルドし、意味解析・型変更・IR生成を確認 |
| 同ファイルの`set_type`二つのオーバーロード | 上流の`Type`と`Nil`別の`previous_def`を正しく呼ぶ | Union引数の一つのメソッドに安易に置換しない。共通本体はマクロで生成 |
| `deps/sources.lock.json`のbrowser-port（取得後の`apply-patches.py`） | Crystal 1.22のWASI/例外処理、LLVMとの接続に必要な上流移植 | バージョン固定。更新時はパッチを先に比較し、例外・マクロ・診断を再検証 |
| `scripts/prepare-browser-ir.py` | LLVM 20のWASM例外処理。`pretty_print`でCFG Stackifyがクラッシュし、`MainVisitor#visit(Yield)`ではcatch先の引数数が不正なWASMを生成 | 該当関数だけ`optnone/noinline`。ユーザーの生成モジュールには適用しない。撤去時はWASM検証・全工程テスト・実ブラウザを確認 |
| `web/runtime/wasi-file-growth.js` | shim 0.4.2の小さい追記ごとの全コピーを避ける | 上流が容量と論理長を正しく分けるまで保持。EOF・seek・stat・resize・allocateを検証 |
| `src/wasm.cr`と`web/runtime/syntax-engine.js` | 軽量な1.23構文エンジンの例外はunwindせずtrapする | 診断をtrap直前に保存。trapしたインスタンスにはfreeも含め再入しない。全工程版の例外処理とは別 |
| `web/runtime/sha256.js` | HTTPの非secure originでは`crypto.subtle`がない | SHA-256の検証を省略しない。ネイティブハッシュと全配布資材の照合テストを維持 |

ファイル拡張の回避策は、この整理で読み取り・リサイズにも適用範囲をそろえました。従来は余剰容量がEOFの先に見えたり、容量内への拡張でもコピー時に失敗したりする経路がありました。上流のコード自体は変更せず、アダプターと回帰テストに閉じ込めています。

## 検証・更新手順

Node 24で実行テストを検証し、CIも同じメジャーバージョンに固定しています。

```sh
npm ci --ignore-scripts  # WASIホストとlint/formatを固定バージョンで取得
npm run web:deps        # 静的配信先へコピー
npm run lint
npm run format:check
npm test               # 実際のWASMコンパイラも使用
```

収録記録と依存取得の検証：

```sh
make samples       # ブラウザと同じWASMコンパイラで8例を解析・リンク
make test-sources  # 固定アーカイブのハッシュ・安全な展開・上書き防止
```

`export-samples.mjs`はmanifestのラベルを保持し、ソースと記録を再生成します。追加例にはmanifestのラベルも追加してください。`compiler-assets.mjs`はNode用の資材読み込みを全工程テストと共有し、ブラウザと同じSHA256検証を使います。全例が成功（エラー教材は所定の診断）してから記録を置き換えます。

Crystal側を変更した場合は対応するWASMを再ビルドしてください。`make wasm`は軽量な構文エンジン、`LLVM_CONFIG=llvm-config-20 make browser`は全工程コンパイラです。その後`make samples`と`make test`を実行します。全工程ビルドの`crystal-host`はWASM生成に必要なビルド用ツールで、配布物には含めません。

ブラウザでは、編集中の結果受信、入力例と収録記録の切替、構文解析の中止、実行・再実行、AST・型依存・IR表示も確認してください。

コンパイラのビルドはメモリを多く使うので、メモリの少ない環境では複数のCrystalコンパイラを同時にビルドしないでください。依存ライブラリ・上流移植パッチの由来は`THIRD_PARTY.md`に記録しています。削除したnpmパッケージの汎用APIをアプリの実行経路へ戻す必要はありません。

取得済み依存はソースZIPに含めません。`make web-deps` / `make browser-deps`で復元します。詳しい方針は[依存管理ガイド](DEPENDENCIES_JA.md)を参照してください。
