// Run against the local app with an installed Playwright package. An absolute
// PLAYWRIGHT_MODULE path can use a temporary install without changing dependencies.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'node:http';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.cache/state-ui');
await mkdir(output, { recursive: true });
const webRoot = path.join(root, 'web');
const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const server = process.env.STATE_UI_URL
  ? null
  : createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = path.resolve(
          webRoot,
          `.${pathname}`,
          pathname.endsWith('/') ? 'index.html' : '',
        );
        if (!file.startsWith(`${webRoot}${path.sep}`)) {
          response.writeHead(403).end();
          return;
        }
        const content = await readFile(file);
        response.writeHead(200, {
          'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream',
        });
        response.end(content);
      } catch {
        response.writeHead(404).end();
      }
    });
if (server)
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
const base = process.env.STATE_UI_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const errors = [];
const checks = [];
const trace = JSON.parse(
  gunzipSync(await readFile(path.join(root, 'spec/fixtures/traces/10_initializers.json.gz'))),
);

try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    reducedMotion: 'reduce',
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/ja/`);
  await page
    .locator('#file')
    .setInputFiles(path.join(root, 'spec/fixtures/traces/10_initializers.json.gz'));
  await page.waitForFunction(
    (max) => document.getElementById('scrubber').max === String(max),
    trace.events.length - 1,
  );
  await page.locator('#tab-declarations').click();
  const overview = page.locator('[data-state-section="holders"]');
  assert.equal(await overview.getAttribute('aria-pressed'), 'true');
  const shelfIDs = await page
    .locator('[data-state-shelf]')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.stateShelf));
  assert.equal(shelfIDs.length, 4);
  assert(!shelfIDs.includes('visitor'));
  checks.push('実トレースを読み込み、保持先の棚を初期表示');

  const seek = async (index) => {
    await page.locator('#scrubber').evaluate((input, value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, index);
    assert((await page.locator('#position').innerText()).startsWith(`${index + 1} /`));
  };
  const firstConstant = trace.events.find((event) => event.activity === 'declare_const');
  await seek(firstConstant.index - 1);
  assert.equal(await page.locator(`[data-state-entry="${firstConstant.index}"]`).count(), 0);
  await seek(firstConstant.index);
  assert.equal(
    await page.locator(`[data-state-entry="${firstConstant.index}"].declaration-changed`).count(),
    1,
  );
  assert.equal(await page.locator('[data-state-shelf="types"].state-shelf-active').count(), 1);
  assert.match(await page.locator('.state-current-change').innerText(), /TopLevelVisitor/);
  checks.push('定数の追加で保持先と行を強調し、操作元を別表示');

  await seek(0);
  assert.equal(await page.locator(`[data-state-entry="${firstConstant.index}"]`).count(), 0);
  assert.deepEqual(
    await page
      .locator('[data-state-shelf]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.stateShelf)),
    shelfIDs,
  );
  checks.push('巻き戻しで未来の情報を除去し、棚の配置を保持');

  const method = trace.events.find(
    (event) => event.kind === 'declaration' && event.declaration_action === 'method',
  );
  await seek(method.index);
  assert.equal(
    await page.locator(`[data-state-type="${method.type_id}"].declaration-changed`).count(),
    1,
  );
  await page.locator(`[data-state-type="${method.type_id}"] [data-semantic-type]`).click();
  assert.equal(
    await page.locator('[data-state-section="types"]').getAttribute('aria-pressed'),
    'true',
  );
  await overview.click();
  await page.locator('#play').click();
  await page.waitForFunction(
    (start) => Number(document.getElementById('scrubber').value) > start + 1,
    method.index,
  );
  await page.locator('#play').click();
  assert.equal(await overview.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#play').getAttribute('data-i18n-aria'), 'play');
  checks.push('型の詳細へ移動して戻り、再生・一時停止しても棚表示を保持');

  const variable = trace.events.find((event) => event.reason === 'local_assignment');
  await seek(variable.index);
  assert.equal(
    await page.locator(`#declarations [data-state-entry="${variable.index}"]`).count(),
    0,
  );
  const environment = page.locator('#activity-context');
  assert.equal(await environment.innerText(), variable.detail);
  assert.equal(await page.locator('#after').innerText(), variable.after);
  await page.screenshot({ path: path.join(output, 'visitor-environment.png'), fullPage: true });
  await page.locator('#event-node').click();
  assert((await page.locator('#position').innerText()).startsWith(`${variable.index + 1} /`));
  checks.push('既存の操作パネルでVisitor環境の文脈・値を表示し、ノード選択でも操作を保持');
  assert.equal(await page.locator('[data-state-shelf="visitor"]').count(), 0);
  await page.locator('.state-sections [data-state-section="variables"]').click();
  assert.equal(
    await page.locator(`#declarations [data-state-entry="${variable.index}"]`).count(),
    0,
  );
  const firstDeclaration = trace.events.find((event) => event.activity === 'declare_var');
  assert.equal(
    await page.locator('[data-state-section="variables"] .state-count').innerText(),
    '2',
  );
  assert.equal(
    await page.locator(`#declarations [data-state-entry="${firstDeclaration.index}"]`).count(),
    1,
  );
  await overview.click();
  await seek(variable.index - 1);
  assert.equal(await environment.isVisible(), false);
  checks.push('Stateの一覧・件数から環境を除外し、巻き戻しで表示が選択操作に追従');

  await page.locator('#compare-view').selectOption('ast');
  assert.equal(await page.locator('#playback').isVisible(), true);
  assert.equal(await page.locator('#declarations-view').isVisible(), true);
  assert.equal(await page.locator('#ast-view').isVisible(), true);
  await page.locator('#compare-view').selectOption('');
  checks.push('ASTとの比較表示でも共通の再生コントロールを使用');

  const newPhase = trace.events.find((event) => event.phase === 'Semantic (new)');
  await seek(newPhase.index);
  assert.match(await page.locator('.state-current-change').innerText(), /未観測/);
  const specialization = trace.events.find((event) => event.reason === 'begin_instantiation');
  await seek(specialization.index);
  assert.equal(
    await page.locator('[data-state-shelf="specializations"].state-shelf-active').count(),
    1,
  );
  assert.match(await page.locator('[data-state-shelf="specializations"]').innerText(), /未観測/);
  checks.push('.new生成と特殊化キャッシュの未観測部分を明示');

  await seek(
    trace.events.findLast(
      (event) => event.kind === 'declaration' && event.declaration_action === 'method',
    ).index,
  );
  await page.locator('#maximize-graph').click();
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
  await writeFile(
    path.join(output, 'desktop-accessibility.yml'),
    await page.locator('#declarations').ariaSnapshot(),
  );
  await page.locator('#maximize-graph').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.getElementById('app').classList.contains('mobile'));
  await seek(variable.index);
  await page.locator('#declarations').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const navBounds = await page.locator('.state-sections').boundingBox();
  const currentBounds = await page.locator('.state-current-change').boundingBox();
  assert(currentBounds.y >= navBounds.y + navBounds.height - 1);
  assert(currentBounds.y + currentBounds.height < 644);
  assert.equal(await page.locator('#playback').isVisible(), true);
  assert(
    await page
      .locator('#declarations')
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  );
  assert(
    await page
      .locator('.state-shelves')
      .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length === 1),
  );
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
  checks.push(
    '390px幅で棚が1列に並び、横はみ出しなし。スクロール中も操作元・保持先と再生ボタンを表示',
  );
  await page.locator('#mobile-navigation [data-pane="details"]').click();
  await environment.scrollIntoViewIfNeeded();
  assert.equal(await environment.isVisible(), true);
  assert(
    await page
      .locator('#event-operation-panel')
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  );
  await page.screenshot({
    path: path.join(output, 'mobile-visitor-environment.png'),
    fullPage: true,
  });
  checks.push('スマートフォンの詳細画面でもVisitor環境を操作ごとに表示');
  await page.locator('#mobile-navigation [data-pane="work"]').click();

  await page.locator('#more-actions').click();
  await page.locator('#language').selectOption('en');
  await page.locator('#more-actions').click();
  assert.match(await page.locator('#declarations').innerText(), /Storage shelves/);
  assert.equal(await overview.getAttribute('aria-pressed'), 'true');
  assert.equal(await environment.innerText(), variable.detail);
  checks.push('表示言語を変えても再生位置と棚表示を保持');

  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator('#tab-source').click();
  await page
    .locator('#source')
    .fill(
      'class Box\n  def initialize(@value : Int32)\n  end\n  def value\n    @value\n  end\nend\nbox = Box.new(3)\nbox.value\n',
    );
  await page.locator('#prelude').uncheck();
  await page.locator('#compile-options-button').click();
  await page.locator('#compile-only').click();
  await page.waitForFunction(() => !document.getElementById('cancel-job').disabled);
  await page.waitForFunction(() => document.getElementById('cancel-job').disabled, undefined, {
    timeout: 120000,
  });
  assert.equal(await page.locator('#notice').getAttribute('class'), '');
  await page.locator('#tab-declarations').click();
  await page.locator('#scrubber').evaluate((input) => {
    input.value = input.max;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.match(await page.locator('#declarations').innerText(), /Box/);
  assert.match(await page.locator('[data-state-shelf="types"]').innerText(), /#initialize|#value/);
  assert.match(
    await page.locator('[data-state-shelf="specializations"]').innerText(),
    /instantiate|Specializ|MainVisitor/,
  );
  await page.screenshot({ path: path.join(output, 'live-compilation.png'), fullPage: true });
  checks.push('ソースを実コンパイルし、型・メソッド・特殊化を棚に反映');

  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
  console.log(
    JSON.stringify(
      {
        checks,
        errors,
        screenshots: [
          'desktop.png',
          'mobile.png',
          'visitor-environment.png',
          'mobile-visitor-environment.png',
          'live-compilation.png',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  server?.close();
}
