/**
 * DATE-15 - Node tests
 * iOS セーフエリア（Dynamic Island 下の二重余白・ホームインジケータ被り）の回帰チェック:
 *   1) Capacitor は contentInset = "never"（ネイティブ側で余白を足さない）
 *   2) 上（ノッチ）の余白は header の padding で1回だけ確保する
 *   3) 下（ホームインジケータ）の余白は body の padding で1回だけ確保する
 *   4) www/ のビルド成果物がルートと一致している
 *
 * 実行: npm test （node --test tests/）
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

const HTML = read('index.html');
const CAP = JSON.parse(read('capacitor.config.json'));

/** body { ... } ブロックの中身 */
function ruleBody(selector) {
    const start = HTML.indexOf(`${selector} {`);
    assert.notEqual(start, -1, `${selector} のスタイルがある`);
    const end = HTML.indexOf('}', start);
    return HTML.slice(start, end);
}

/* ------------------------------------------------------------------ *
 * 1. Capacitor 設定：セーフエリア制御は Web/CSS 側に一本化
 * ------------------------------------------------------------------ */
test('Capacitor: ios.contentInset は "never"（ネイティブ側で余白を足さない）', () => {
    assert.equal(CAP.ios.contentInset, 'never');
    assert.equal(CAP.ios.backgroundColor, '#FAF5F2', '地の色はアプリの背景色のまま');
    assert.equal(CAP.ios.preferredContentMode, 'mobile', 'モバイル表示のまま');
    assert.equal(CAP.appId, 'com.oekaki.date15', 'バンドルIDは変えない');
    assert.equal(CAP.webDir, 'www');
});

test('Capacitor: 画面全高を使う前提が viewport-fit=cover と揃っている', () => {
    assert.match(HTML, /viewport-fit=cover/, 'env(safe-area-inset-*) を有効にする');
});

/* ------------------------------------------------------------------ *
 * 2. 上セーフエリア（Dynamic Island）: 余白は1回だけ
 * ------------------------------------------------------------------ */
test('CSS: header の上余白は env(safe-area-inset-top) + 0.5rem の1回だけ', () => {
    const header = ruleBody('header');
    assert.match(header, /padding-top:\s*calc\(env\(safe-area-inset-top, 0px\) \+ 0\.5rem\)\s*!important;/, 'calc で1回だけ足す（Tailwind の py-2 を上書き）');
    assert.doesNotMatch(header, /padding-top:\s*env\(safe-area-inset-top\)/, 'そのままの env() だけを書かない');
});

test('CSS: body では上セーフエリアを足さない（header との二重余白を防ぐ）', () => {
    const body = ruleBody('body');
    assert.doesNotMatch(body, /padding-top:\s*env\(safe-area-inset-top\)/, '上余白は header 側に一本化');
});

test('HTML: ヘッダーに上セーフエリアのパディングを二重に書かない', () => {
    const headerTag = HTML.slice(HTML.indexOf('<header'), HTML.indexOf('>', HTML.indexOf('<header')) + 1);
    assert.doesNotMatch(headerTag, /pt-\[calc\([^\]]*safe-area-inset-top/, 'セーフエリア余白は <style> に一本化');
});

/* ------------------------------------------------------------------ *
 * 3. 下セーフエリア（ホームインジケータ）
 * ------------------------------------------------------------------ */
test('CSS: body の下余白は env(safe-area-inset-bottom) の1回だけ', () => {
    const body = ruleBody('body');
    assert.match(body, /padding-bottom:\s*env\(safe-area-inset-bottom\);/, 'フッターがホームインジケータに被らない');
    assert.equal((HTML.match(/padding-bottom:\s*env\(safe-area-inset-bottom\)/g) || []).length, 1, '下余白の二重指定はしない');
});

test('HTML: 画面下に固定表示する要素が無い（固定UIの被りが起きない）', () => {
    assert.doesNotMatch(HTML, /class="[^"]*\bfixed\s+bottom-0/, '下部固定バーは無い');
    const appJs = read('app.js');
    assert.doesNotMatch(appJs, /position:\s*fixed/, 'JS から下部固定UIを作らない');
});

/* ------------------------------------------------------------------ *
 * 4. Web（env = 0px）の既存表示を壊さない
 * ------------------------------------------------------------------ */
test('互換: Web では env(safe-area-inset-top) が 0px になり従来の余白（py-2 = 0.5rem）と一致する', () => {
    const header = ruleBody('header');
    assert.match(header, /\+ 0\.5rem\)/);
});

/* ------------------------------------------------------------------ *
 * 5. ビルド成果物（www/）の同期
 * ------------------------------------------------------------------ */
test('ビルド: www/ の各ファイルがルートと一致する', () => {
    const files = ['index.html', 'app.js', 'config.js', 'privacy.html', 'terms.html', 'support.html'];
    files.forEach((file) => {
        const wwwPath = path.join(ROOT, 'www', file);
        assert.ok(fs.existsSync(wwwPath), `www/${file} が存在する`);
        assert.equal(read(path.join('www', file)), read(file), `www/${file} がルートと同一`);
    });
});

test('ビルド: scripts/build.js のコピー対象がルートの配信ファイルを漏らしていない', () => {
    const build = read('scripts/build.js');
    const rootFiles = fs.readdirSync(ROOT).filter((file) => /\.(html|js|png|ico)$/.test(file));
    const required = rootFiles.filter((file) => file !== 'package.json' && !file.startsWith('.'));

    required.forEach((file) => {
        assert.ok(build.includes(`'${file}'`), `${file} が COPY_FILES に入っている`);
    });
});
