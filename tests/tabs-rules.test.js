/**
 * DATE-15 - Node tests
 * iPhoneアプリ（Capacitor ネイティブ）だけの3タブ表示と、起動時のルール説明:
 *   1) 判定は Capacitor.isNativePlatform()。Webブラウザでは何もしない（1ページ表示のまま）
 *   2) ネイティブでは <html data-date15-tabs="true"> が付き、最初は 🎲 ルーレットのタブ
 *   3) タブを押すとそのセクションだけが表示され、スクロールは先頭に戻る
 *   4) ルール説明は初回起動だけ自動表示。閉じたら localStorage に既読を記憶する
 *   5) ヘッダーの「？」からはいつでも開ける（Web版では出さない）
 *   6) ルール説明の中身が実際の機能（ルーレット／投稿／一覧）と一致している
 *   7) 投稿後は iPhoneアプリでは「一覧」タブへ移る
 *
 * 実行: npm test （node --test tests/）
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const TABS_JS = fs.readFileSync(path.join(ROOT, 'tabs.js'), 'utf8');
const APP_JS = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

/**
 * index.html を jsdom に読み込み、tabs.js をその window で実行する。
 * 外部スクリプト（Tailwind CDN・Google Fonts）は読みに行かない。
 * @param {{ native?: boolean, seen?: boolean, storage?: boolean }} options
 */
function createPage(options = {}) {
    const native = options.native !== false;
    const dom = new JSDOM(HTML, { url: 'https://example.test/', runScripts: 'outside-only' });
    const { window } = dom;

    const scrollCalls = [];
    window.scrollTo = (x, y) => scrollCalls.push([x, y]);

    if (options.storage === false) {
        Object.defineProperty(window, 'localStorage', {
            configurable: true,
            get() { throw new Error('localStorage is not available'); }
        });
    } else if (options.seen) {
        window.localStorage.setItem('date15_rules_seen', '1');
    }

    if (native) {
        window.Capacitor = { isNativePlatform: () => true };
    }

    window.eval(TABS_JS);
    return { dom, window, document: window.document, scrollCalls };
}

function panel(page, id) {
    return page.document.querySelector(`[data-date15-panel="${id}"]`);
}

function tabButton(page, id) {
    return page.document.querySelector(`[data-date15-tab="${id}"]`);
}

function overlay(page) {
    return page.document.getElementById('date15RulesOverlay');
}

/* ------------------------------------------------------------------ *
 * 1. Webブラウザは今の1ページ縦長表示のまま
 * ------------------------------------------------------------------ */
test('Webブラウザ: init() は何もしない（タブ属性なし・セクションは全部表示・ルール自動表示なし）', () => {
    const page = createPage({ native: false });
    const result = window_init(page);

    assert.equal(result.native, false);
    assert.equal(result.tabMode, false);
    assert.equal(result.autoShown, false);
    assert.equal(page.document.documentElement.hasAttribute('data-date15-tabs'), false);

    ['roulette', 'post', 'list'].forEach((id) => {
        assert.equal(panel(page, id).hasAttribute('hidden'), false, `${id} のセクションは隠さない`);
    });
    assert.equal(overlay(page).classList.contains('is-open'), false, 'ルール説明は自動で出さない');
    assert.equal(
        page.window.getComputedStyle(page.document.getElementById('btnOpenRules')).display,
        'none',
        '「？」ボタンは Web版では出さない（CSSで切り替え）'
    );
});

test('Webブラウザ: タブバー・「？」ボタンの CSS はネイティブのタブ表示時だけ効く', () => {
    assert.match(HTML, /\.date15-tabbar \{[^}]*display: none;/s);
    assert.match(HTML, /html\[data-date15-tabs="true"\] \.date15-tabbar \{/);
    assert.match(HTML, /\.date15-rules-open \{\s*display: none;/);
    assert.match(HTML, /html\[data-date15-tabs="true"\] \.date15-rules-open \{\s*display: flex;/);
    assert.match(HTML, /html\[data-date15-tabs="true"\] aside,\s*html\[data-date15-tabs="true"\] footer \{/);
});

/* ------------------------------------------------------------------ *
 * 2. ネイティブは3タブ（最初はルーレット）
 * ------------------------------------------------------------------ */
test('ネイティブ: <html data-date15-tabs="true"> が付き、最初はルーレットのタブ', () => {
    const page = createPage();
    const result = window_init(page);

    assert.equal(result.native, true);
    assert.equal(page.document.documentElement.getAttribute('data-date15-tabs'), 'true');
    assert.equal(panel(page, 'roulette').hasAttribute('hidden'), false);
    assert.equal(panel(page, 'post').hasAttribute('hidden'), true);
    assert.equal(panel(page, 'list').hasAttribute('hidden'), true);
    assert.equal(tabButton(page, 'roulette').getAttribute('aria-selected'), 'true');
    assert.equal(tabButton(page, 'post').getAttribute('aria-selected'), 'false');
});

test('ネイティブ: タブバーは3つ（🎲 ルーレット／💌 投稿する／🏆 一覧）', () => {
    const page = createPage();
    const buttons = Array.from(page.document.querySelectorAll('[data-date15-tab]'));
    assert.deepEqual(buttons.map((b) => b.getAttribute('data-date15-tab')), ['roulette', 'post', 'list']);
    assert.deepEqual(buttons.map((b) => b.textContent.replace(/\s+/g, '')), ['🎲ルーレット', '💌投稿する', '🏆一覧']);
});

test('ネイティブ: タブを押すとそのセクションだけ表示され、スクロールは先頭に戻る', () => {
    const page = createPage();
    window_init(page);

    tabButton(page, 'post').click();
    assert.equal(panel(page, 'post').hasAttribute('hidden'), false);
    assert.equal(panel(page, 'roulette').hasAttribute('hidden'), true);
    assert.equal(panel(page, 'list').hasAttribute('hidden'), true);
    assert.equal(tabButton(page, 'post').getAttribute('aria-selected'), 'true');
    assert.equal(tabButton(page, 'roulette').getAttribute('aria-selected'), 'false');
    assert.deepEqual(page.scrollCalls.at(-1), [0, 0], 'タブ切り替えで先頭へ戻る');

    tabButton(page, 'list').click();
    assert.equal(panel(page, 'list').hasAttribute('hidden'), false);
    assert.equal(panel(page, 'post').hasAttribute('hidden'), true);
    assert.equal(page.window.Date15Tabs.getCurrentTab(), 'list');
});

/* ------------------------------------------------------------------ *
 * 3. 起動時のルール説明
 * ------------------------------------------------------------------ */
test('ルール説明: 初回起動は自動で開き、閉じると既読を localStorage に残す', () => {
    const page = createPage();
    const result = window_init(page);

    assert.equal(result.autoShown, true);
    assert.equal(overlay(page).classList.contains('is-open'), true);
    assert.equal(overlay(page).getAttribute('aria-hidden'), 'false');
    assert.equal(page.window.localStorage.getItem('date15_rules_seen'), null, '閉じるまでは未読');

    page.document.getElementById('btnCloseRules').click();
    assert.equal(overlay(page).classList.contains('is-open'), false);
    assert.equal(overlay(page).getAttribute('aria-hidden'), 'true');
    assert.equal(page.window.localStorage.getItem('date15_rules_seen'), '1', '既読を記憶する');
    assert.equal(page.document.body.style.overflow, '', '背景のスクロール固定を戻す');
});

test('ルール説明: 2回目以降の起動では自動表示しない（毎回邪魔しない）', () => {
    const page = createPage({ seen: true });
    const result = window_init(page);

    assert.equal(result.autoShown, false);
    assert.equal(overlay(page).classList.contains('is-open'), false);
});

test('ルール説明: 「？」ボタンからは既読後でも開けて、✕ でも閉じられる', () => {
    const page = createPage({ seen: true });
    window_init(page);

    const openButton = page.document.getElementById('btnOpenRules');
    assert.notEqual(page.window.getComputedStyle(openButton).display, 'none', 'ネイティブでは「？」を出す');
    openButton.click();
    assert.equal(overlay(page).classList.contains('is-open'), true);

    page.document.getElementById('btnCloseRulesX').click();
    assert.equal(overlay(page).classList.contains('is-open'), false);
});

test('ルール説明: 背景タップ・Escape でも閉じる', () => {
    const page = createPage();
    window_init(page);

    overlay(page).click();
    assert.equal(overlay(page).classList.contains('is-open'), false, '背景タップで閉じる');

    page.window.Date15Tabs.openRules();
    assert.equal(overlay(page).classList.contains('is-open'), true);
    page.document.dispatchEvent(new page.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(overlay(page).classList.contains('is-open'), false, 'Escape で閉じる');
});

test('ルール説明: localStorage が使えない環境でも起動・表示が止まらない', () => {
    const page = createPage({ storage: false });
    const result = window_init(page);

    assert.equal(result.autoShown, true);
    assert.equal(overlay(page).classList.contains('is-open'), true);
    page.document.getElementById('btnCloseRules').click();
    assert.equal(overlay(page).classList.contains('is-open'), false);
});

test('ルール説明: 閉じたあとに一度だけコールバック（広告の初期化）が呼ばれる', () => {
    const page = createPage();
    let calls = 0;
    page.window.Date15Tabs.init({ onRulesClosed: () => { calls++; } });
    assert.equal(calls, 0, '開いただけでは呼ばない');

    page.document.getElementById('btnCloseRules').click();
    assert.equal(calls, 1);

    page.window.Date15Tabs.openRules();
    page.document.getElementById('btnCloseRules').click();
    assert.equal(calls, 1, '2回目以降は呼ばない');
});

test('ルール説明: 文言が実際の機能と一致している', () => {
    const page = createPage();
    const text = page.document.getElementById('date15RulesOverlay').textContent.replace(/\s+/g, '');
    assert.match(text, /ルーレット/);
    assert.match(text, /みんなが投稿したデートプランを、ランダムで1つ引けます/);
    assert.match(text, /投稿する/);
    assert.match(text, /ぴったり15文字で投稿できます/);
    assert.match(text, /一覧/);
    assert.match(text, /人気順・新着順・ランダム/);
    assert.match(text, /いいね/);
    assert.match(text, /はじめる/, '閉じるボタンの文言');
    ['privacy.html', 'terms.html', 'support.html'].forEach((href) => {
        assert.ok(page.document.querySelector(`#date15RulesOverlay a[href="${href}"]`), `${href} へのリンクがある`);
    });
});

/* ------------------------------------------------------------------ *
 * 4. 既存機能との連携
 * ------------------------------------------------------------------ */
test('連携: 投稿が成功したら iPhoneアプリでは一覧タブへ移る実装になっている', () => {
    assert.match(APP_JS, /tabsApi\.isTabMode\(\)/);
    assert.match(APP_JS, /tabsApi\.showTab\('list'\)/);
    const submit = APP_JS.slice(APP_JS.indexOf('async function submitPlan'), APP_JS.indexOf('function toggleLike'));
    assert.ok(
        submit.indexOf("showTab('list')") > submit.indexOf('alert('),
        '投稿完了のあとにタブを移す（投稿処理の途中で画面が飛ばない）'
    );
});

test('連携: Web版ではタブ関連の初期化が何もしないので既存の1ページ表示は変わらない', () => {
    assert.match(APP_JS, /window\.Date15Tabs/);
    assert.match(APP_JS, /if \(!ui \|\| !ui\.autoShown\) initAdMobBanner\(\);/);
    assert.doesNotMatch(APP_JS, /documentElement\.setAttribute\('data-date15-tabs'/, 'タブ属性は tabs.js だけが付ける');
});

/* ------------------------------------------------------------------ *
 * 5. ビルド成果物
 * ------------------------------------------------------------------ */
test('ビルド: www/tabs.js がルートと一致し、index.html から読み込まれる', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'www', 'tabs.js')));
    assert.equal(fs.readFileSync(path.join(ROOT, 'www', 'tabs.js'), 'utf8'), TABS_JS);
    assert.match(HTML, /<script src="tabs\.js\?v=/);
    assert.ok(
        HTML.indexOf('tabs.js') < HTML.indexOf('app.js?v='),
        'app.js より先に読み込む（タブ判定を先に用意する）'
    );
});

/**
 * ページの window で Date15Tabs.init() を呼ぶ小さなヘルパー。
 * （毎回 window.Date15Tabs.init(...) と書くと読みにくいため）
 */
function window_init(page, options) {
    return page.window.Date15Tabs.init(options || {});
}
