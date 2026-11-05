# Git管理と依存の復元

アプリ本体と固定情報をGitで管理し、取得できる他プロジェクトのソースは管理対象から外します。npmと固定アーカイブで復元できるため、通常のcloneとZIP展開で同じ手順を使えます。

## 管理対象

| 対象 | Gitに入れるもの | 取得・生成先 | 復元方法 |
|---|---|---|---|
| アプリ本体・テスト・説明書 | `src/`, `web/`, `spec/`, `scripts/`, `docs/`の自作コード | 同じ場所 | clone / ZIP |
| Crystal 1.23.0-dev（軽量構文WASM） | `deps/sources.lock.json`のcommit・SHA256 | `vendor/crystal-src/` | `make syntax-deps` |
| Crystal 1.22.0（全工程WASM） | 同上 | `vendor/crystal-browser-src/` | `make browser-deps` |
| browser-crystalのWASI移植パッチ | 同上 | `.cache/sources/browser-port/apply-patches.py` | 同上 |
| browser_wasi_shim 0.4.2 | `package.json`, `package-lock.json` | `node_modules/` → `web/vendor/browser_wasi_shim/` | `make web-deps` |
| Prism 1.30.0（Crystalの色分け） | `package.json`, `package-lock.json` | `node_modules/` → `web/vendor/prismjs/` | `make web-deps` |
| アプリ固有の観測と回避策 | `src/lab/`, `web/runtime/`, `scripts/prepare-browser-ir.py` | 同じ場所 | Gitで差分管理 |
| 配布用WASM・ランタイム・圧縮記録 | `web/syntax.wasm`, `web/assets/`, `web/traces/` | 同じ場所 | Gitに保持 |
| ライセンス・由来 | `THIRD_PARTY.md`, `vendor/`と`web/vendor/browser-crystal/`の通知 | 同じ場所 | Gitに保持 |

軽量構文エンジンのソースはcommit `25b1e80df925f4b7a003f7455d79a1eccc39874f`で固定しています。全工程用は1.22.0です。観測用の拡張は`src/lab/`に置き、上流ソースを直接編集しません。上流WASIパッチは`.cache/browser/src/`の作業コピーへ適用します。LLVM 20の最適化除外は`prepare-browser-ir.py`で管理します。

両エンジンのバージョン情報は、それぞれの入口からRecorderへ渡します。全工程ビルドには1.22.0と移植パッチだけ、構文エンジンのビルドには1.23.0-devだけを取得します。

## 初回の準備

Webアプリを動かす場合（Node 24、npm、RubyまたはPython）：

```sh
make web-deps
ruby -run -e httpd web -p 8000 --bind-address=127.0.0.1
# または python3 scripts/serve.py
```

`make deps`も`make web-deps`と同じです。npm処理はWASIホストとPrism（core/clike/ruby/crystal）のJavaScriptおよびライセンスを静的配信先へコピーします。起動後にCDNやnpmへ接続する必要はありません。Crystal・LLVMの再ビルドも不要です。

軽量構文WASMを再ビルドする場合は、Crystal 1.22.0と`wasm-ld`を用意して`make wasm`を実行します。ソース取得も自動で行います。

全工程WASMコンパイラを再ビルドする場合：

```sh
LLVM_CONFIG=llvm-config-20 make browser
make samples
make test
```

`make browser`は固定ソースの復元、パッチ適用、WASM生成と検証、資材の更新を行います。Crystal 1.22.0 / LLVM 20 / C++ / Node 24等が必要です。ビルド用コンパイラは`.cache/browser/bin/crystal-host`に置き、配布しません。Web UIだけの変更ではこのビルドは不要です。

## Gitへの移行

ZIPを新しいディレクトリに展開して、次のように始められます。

```sh
git init -b main
git add .
git status --short
git commit -m "Initial Crystal Observatory source"
```

取得済みCrystalソースやnpm依存は`.gitignore`により登録対象から外れます。`tokei`はGitリポジトリ内で実行してください。`--no-ignore`を付けると、取得済み依存も数えられます。

すでに依存をGitへ登録していた場合、`.gitignore`だけでは登録は解除されません。手元の変更を確認・退避した後、対象を限定してインデックスから外します。`--cached`なので作業ファイルは残ります。

```sh
git rm -r --cached --ignore-unmatch vendor/crystal-src vendor/crystal-browser-src \
  web/vendor/browser_wasi_shim web/vendor/prismjs node_modules
```

取得スクリプトは、取得情報のないディレクトリやロックと異なるバージョンを上書きしません。既存の取得先を使い直す場合はローカル変更を確認し、別の場所へ退避してから再取得してください。

## 配布資材と更新

WASM・ランタイム・圧縮記録は、cloneから重い再ビルドなしで動かせるようGit管理対象に残しています。`asset-receipts.js`がコンパイラ資材の長さとSHA256を保持します。PagesワークフローはnpmからWASIホストを準備して`web/`を配信します。

- WASIホストは`npm install --save-exact @bjorn3/browser_wasi_shim@<version>`で更新し、ロックとテストを更新します。生成先を直接修正しません。
- Crystalまたは移植パッチの更新時は、`deps/sources.lock.json`のrevision、URL、SHA256、prefixを一緒に更新します。既存の取得先を退避し、取得・パッチ適用・ビルド・テストを行います。
- 独自パッチは取得済みファイルの手修正で済ませず、プロジェクト内に保存し、準備スクリプトから適用します。
- キャッシュは`.cache/downloads/`に保存します。`python3 scripts/fetch_sources.py all --offline`はSHA256を確認して再利用し、不足時は失敗します。
- `make samples`はNode上でブラウザと同じWASMを動かし、8例の記録を生成します。エラー教材以外はリンク成功まで確認します。

```sh
make test
python3 scripts/package.py dist/crystal-observatory-0.1.0.zip
```

パッケージ作成時も、依存の展開先、キャッシュ、ビルド用ツールを除外します。
