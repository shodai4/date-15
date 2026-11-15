/**
 * DATE-15 - Node tests
 * Google AdMob 下部バナー（iOS / Capacitor）の組み込みと、
 * 「テスト広告 / 本番広告」の切り替え（無効トラフィック対策）を検証する。
 *
 *   1) 本番ID（アプリID / バナー）が config.js・admob.js・configure-ios.js で一致する
 *   2) Google のサンプル（テスト）ユニットIDがコードに残っていない
 *   3) USE_TEST_ADS: true の間は isTesting: true（テスト広告）で initialize / バナーを要求する
 *   4) false に切り替えた瞬間に isTesting: false（本番広告）へ移る
 *   5) 設定が無い環境は安全側（テスト広告）に倒れる
 *   6) Webブラウザ（ネイティブでない）ではプラグインを呼ばず、例外も投げない
 *   7) バナー表示中は本文の下に余白が入り、投稿ボタン・フッターが隠れない
 *   8) 読み込み失敗・非表示時は余白を戻す（空白だけ残さない）
 *
 * 実行: npm test （node --test tests/）
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const ADMOB_SOURCE = fs.readFileSync(path.join(ROOT, 'admob.js'), 'utf8');
const { CONFIG_ENTRIES } = require(path.join(ROOT, 'scripts', 'configure-ios.js'));

/** 2026-11-15 に AdMob 管理画面から発行された本番ID */
const PROD_APP_ID = 'ca-app-pub-5739782559889389~9293414856';
const PROD_BANNER_ID = 'ca-app-pub-5739782559889389/5354169841';
/** Google のサンプルID（これが出荷コードに残っていたら事故） */
const GOOGLE_SAMPLE_PREFIX = 'ca-app-pub-3940256099942544';

/* ------------------------------------------------------------------ *
 * config.js を読み取る（window.DATE_CONFIG を取り出す）
 * ------------------------------------------------------------------ */
function loadConfig() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'), sandbox);
  return sandbox.window.DATE_CONFIG;
}

/* ------------------------------------------------------------------ *
 * スタブ（jsdom を使わず、admob.js が触る最小限の DOM と Capacitor だけ用意する）
 * ------------------------------------------------------------------ */
function createElement() {
  const attributes = {};
  return {
    attributes,
    setAttribute(name, value) { attributes[name] = value; },
    removeAttribute(name) { delete attributes[name]; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; }
  };
}

function createHarness(options = {}) {
  const calls = {
    initialize: [],
    showBanner: [],
    hideBanner: 0,
    removeBanner: 0,
    requestTrackingAuthorization: 0,
    listeners: []
  };

  const plugin = {
    async initialize(opts) { calls.initialize.push(opts); },
    async showBanner(opts) {
      if (options.showBannerFails) throw new Error('ad request failed');
      calls.showBanner.push(opts);
    },
    async hideBanner() { calls.hideBanner += 1; },
    async removeBanner() { calls.removeBanner += 1; },
    async trackingAuthorizationStatus() {
      return { status: options.trackingStatus || 'notDetermined' };
    },
    async requestTrackingAuthorization() { calls.requestTrackingAuthorization += 1; },
    addListener(name, callback) {
      calls.listeners.push({ name, callback });
      return { remove() {} };
    }
  };

  const body = createElement();
  const cssVariables = {};
  const documentElement = {
    style: {
      setProperty(name, value) { cssVariables[name] = value; },
      getPropertyValue(name) { return cssVariables[name] || ''; }
    }
  };

  const native = options.native !== false;
  const window = {
    Capacitor: {
      isNativePlatform: () => native,
      Plugins: native ? { AdMob: plugin } : {}
    }
  };
  if (Object.prototype.hasOwnProperty.call(options, 'config')) {
    window.DATE_CONFIG = options.config;
  }

  const context = {
    console: { log() {}, warn() {}, error() {} },
    document: { body, documentElement },
    window
  };
  vm.createContext(context);
  vm.runInContext(ADMOB_SOURCE, context);

  const api = context.window.Date15AdMob;
  const manager = new api.AdMobManager({ deferInit: true });

  return { context, api, manager, calls, body, cssVariables, window };
}

/** config.js の ADMOB を差し替えた設定オブジェクト */
function configWith(testAds) {
  const config = JSON.parse(JSON.stringify(loadConfig()));
  config.ADMOB.USE_TEST_ADS = testAds;
  return config;
}

/* ------------------------------------------------------------------ *
 * 1. 本番IDの組み込み
 * ------------------------------------------------------------------ */
test('本番ID: config.js にアプリIDとバナーIDが本番値で入っている', () => {
  const config = loadConfig();

  assert.ok(config.ADMOB, 'window.DATE_CONFIG.ADMOB がある');
  assert.equal(config.ADMOB.APP_ID, PROD_APP_ID);
  assert.equal(config.ADMOB.BANNER_AD_ID, PROD_BANNER_ID);
  assert.equal(typeof config.ADMOB.USE_TEST_ADS, 'boolean', 'テスト/本番の切り替えスイッチがある');

  // AdMob のID形式（アプリIDは ~、広告ユニットは /）
  assert.match(config.ADMOB.APP_ID, /^ca-app-pub-\d{16}~\d{10}$/);
  assert.match(config.ADMOB.BANNER_AD_ID, /^ca-app-pub-\d{16}\/\d{10}$/);

  // 既存の Supabase 設定を壊していない
  assert.equal(config.TABLE_NAME, 'date_plans');
  assert.match(config.SUPABASE_URL, /^https:\/\/.+\.supabase\.co$/);
});

test('本番ID: admob.js のフォールバック定数も本番値（config.js が読めなくても本番ユニットを使う）', () => {
  const { api } = createHarness();
  assert.equal(api.ADMOB_AD_UNITS.appId, PROD_APP_ID);
  assert.equal(api.ADMOB_AD_UNITS.banner, PROD_BANNER_ID);
});

test('安全策: Google のサンプル（テスト）ユニットIDがコードに残っていない', () => {
  ['admob.js', 'index.html', 'config.js'].forEach((file) => {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.equal(source.includes(GOOGLE_SAMPLE_PREFIX), false, `${file} に Google サンプルIDが残っている`);
  });

  // configure-ios.js は「サンプルIDを検出して警告する」ためだけにこの文字列を持つ。
  // 値として（<string>…</string> で）入っていたら事故なので、そこだけを見る。
  const configure = fs.readFileSync(path.join(ROOT, 'scripts', 'configure-ios.js'), 'utf8');
  assert.equal(
    configure.includes(`<string>${GOOGLE_SAMPLE_PREFIX}`),
    false,
    'configure-ios.js がサンプルIDを Info.plist の値として書いている'
  );
});

test('本番ID: バナー要求には常に本番ユニットIDを載せ、isTesting でテスト広告へ切り替える', async () => {
  const { manager, calls } = createHarness({ config: configWith(true) });
  assert.equal(manager.bannerAdId, PROD_BANNER_ID);

  await manager.init();
  assert.equal(calls.showBanner[0].adId, PROD_BANNER_ID, 'テスト中でもID自体は本番ユニットを渡す');
  assert.equal(calls.showBanner[0].isTesting, true, 'テスト広告フラグでプラグインが公式テストへ差し替える');
});

/* ------------------------------------------------------------------ *
 * 2. テスト広告 / 本番広告の切り替え（無効トラフィック対策）
 * ------------------------------------------------------------------ */
test('テストモード: USE_TEST_ADS=true なら isTesting=true で初期化・バナーを要求する', async () => {
  const { manager, calls, body } = createHarness({ config: configWith(true) });
  assert.equal(manager.isTesting, true);

  await manager.init();

  assert.equal(calls.initialize.length, 1);
  assert.equal(calls.initialize[0].initializeForTesting, true);
  assert.equal(calls.initialize[0].requestTrackingAuthorization, true, 'ATT を出す宣言');

  assert.equal(calls.showBanner.length, 1);
  assert.equal(calls.showBanner[0].isTesting, true);
  assert.equal(calls.showBanner[0].adSize, 'ADAPTIVE_BANNER');
  assert.equal(calls.showBanner[0].position, 'BOTTOM_CENTER');
  assert.equal(calls.showBanner[0].margin, 0);
  assert.equal(body.getAttribute('data-native-banner'), 'true', '下部余白を確保する');
});

test('本番モード: USE_TEST_ADS=false なら isTesting=false で本番広告を要求する', async () => {
  const { manager, calls } = createHarness({ config: configWith(false) });
  assert.equal(manager.isTesting, false);

  await manager.init();

  assert.equal(calls.initialize[0].initializeForTesting, false);
  assert.equal(calls.showBanner[0].isTesting, false);
  assert.equal(calls.showBanner[0].adId, PROD_BANNER_ID);
});

test('切り替え1か所: config.js を false にした瞬間から本番広告になる（再起動不要）', async () => {
  const harness = createHarness({ config: configWith(true) });
  const { manager, calls, window } = harness;

  await manager.init();
  assert.equal(calls.showBanner[0].isTesting, true);

  window.DATE_CONFIG.ADMOB.USE_TEST_ADS = false;
  assert.equal(manager.isTesting, false);

  await manager.showBanner();
  const latest = calls.showBanner[calls.showBanner.length - 1];
  assert.equal(latest.isTesting, false, 'フラグ変更後のリクエストは本番広告');
  assert.equal(latest.adId, PROD_BANNER_ID);
});

test('安全側: USE_TEST_ADS が無い / config.js が読めない環境ではテスト広告に倒す', async () => {
  const noFlag = JSON.parse(JSON.stringify(loadConfig()));
  delete noFlag.ADMOB.USE_TEST_ADS;

  const withBrokenFlag = createHarness({ config: noFlag });
  assert.equal(withBrokenFlag.api.isAdMobTestingMode(), true);
  assert.equal(withBrokenFlag.manager.isTesting, true);

  const noConfig = createHarness();
  assert.equal(noConfig.api.isAdMobTestingMode(), true, '設定そのものが無ければテスト広告');
  assert.equal(noConfig.manager.isTesting, true);
});

/* ------------------------------------------------------------------ *
 * 3. Webブラウザでは何もしない（エラーも出さない）
 * ------------------------------------------------------------------ */
test('Webブラウザ: ネイティブでなければプラグインを呼ばず、余白も付けない', async () => {
  const { manager, calls, body } = createHarness({ config: configWith(true), native: false });

  await assert.doesNotReject(() => manager.init());

  assert.equal(calls.initialize.length, 0);
  assert.equal(calls.showBanner.length, 0);
  assert.equal(calls.requestTrackingAuthorization, 0);
  assert.equal(body.getAttribute('data-native-banner'), null, 'Webでは下部余白を足さない');

  assert.equal(await manager.showBanner(), false);
  assert.equal(await manager.hideBanner(), false);
  assert.equal(calls.showBanner.length, 0);
});

/* ------------------------------------------------------------------ *
 * 4. 下部余白（投稿ボタン・フッターがバナーに隠れない）
 * ------------------------------------------------------------------ */
test('下部余白: バナー表示時に実測の高さを CSS 変数へ入れ、余白を確保する', async () => {
  const { manager, calls, body, cssVariables } = createHarness({ config: configWith(true) });

  await manager.init();
  assert.equal(body.getAttribute('data-native-banner'), 'true');
  assert.equal(cssVariables['--admob-banner-height'], '50px', '読み込み前は既定の高さで場所を空ける');

  // 実際のバナー高さ（ADAPTIVE_BANNER は端末幅で 50/60 などに変わる）
  const sizeListener = calls.listeners.find((item) => item.name === 'bannerAdSizeChanged');
  assert.ok(sizeListener, 'バナーサイズ変更イベントを購読している');
  sizeListener.callback({ width: 375, height: 66 });

  assert.equal(cssVariables['--admob-banner-height'], '66px', '実測値で余白を合わせる');
  assert.equal(body.getAttribute('data-native-banner'), 'true');
});

test('下部余白: 読み込み失敗時は余白を解除する（広告が無いのに空白を残さない）', async () => {
  const { manager, calls, body } = createHarness({ config: configWith(true) });

  await manager.init();
  assert.equal(body.getAttribute('data-native-banner'), 'true');

  const failListener = calls.listeners.find((item) => item.name === 'bannerAdFailedToLoad');
  assert.ok(failListener, '読み込み失敗イベントを購読している');
  failListener.callback({ message: 'no fill' });

  assert.equal(body.getAttribute('data-native-banner'), null, '余白を戻す');
});

test('下部余白: バナー表示そのものが失敗したら余白を付けない', async () => {
  const { manager, body, calls } = createHarness({ config: configWith(true), showBannerFails: true });

  await manager.init();

  assert.equal(calls.showBanner.length, 0);
  assert.equal(body.getAttribute('data-native-banner'), null);
});

test('下部余白: hideBanner で余白も元に戻る', async () => {
  const { manager, body, calls } = createHarness({ config: configWith(true) });

  await manager.init();
  assert.equal(body.getAttribute('data-native-banner'), 'true');

  await manager.hideBanner();
  assert.equal(body.getAttribute('data-native-banner'), null);
  assert.equal(calls.hideBanner, 1);
  assert.equal(calls.removeBanner, 1);
});

test('CSS: body[data-native-banner="true"] がバナー高さ＋下セーフエリアの余白を持つ', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const start = html.indexOf('body[data-native-banner="true"] {');
  assert.notEqual(start, -1, 'バナー表示中の余白ルールがある');
  const block = html.slice(start, html.indexOf('}', start));

  assert.match(block, /padding-bottom:\s*calc\(var\(--admob-banner-height, 50px\) \+ env\(safe-area-inset-bottom\)\)/);
  // 素の下セーフエリア余白（body）は1回だけのまま
  assert.equal((html.match(/padding-bottom:\s*env\(safe-area-inset-bottom\)\s*;/g) || []).length, 1);
});

/* ------------------------------------------------------------------ *
 * 5. ATT（トラッキング許可）と二重初期化の防止
 * ------------------------------------------------------------------ */
test('ATT: 未回答（notDetermined）のときだけ許可ダイアログを出す', async () => {
  const ask = createHarness({ config: configWith(true), trackingStatus: 'notDetermined' });
  await ask.manager.init();
  assert.equal(ask.calls.requestTrackingAuthorization, 1);

  const already = createHarness({ config: configWith(false), trackingStatus: 'authorized' });
  await already.manager.init();
  assert.equal(already.calls.requestTrackingAuthorization, 0, '回答済みなら二度と聞かない');
});

test('二重初期化の防止: init() を2回呼んでも initialize は1回だけ（ATT の二重要求を防ぐ）', async () => {
  const { manager, calls } = createHarness({ config: configWith(true) });

  await manager.init();
  await manager.init();

  assert.equal(calls.initialize.length, 1);
  assert.equal(calls.showBanner.length, 1);
  assert.equal(calls.requestTrackingAuthorization, 1);
});

/* ------------------------------------------------------------------ *
 * 6. Info.plist（configure-ios.js）との整合
 * ------------------------------------------------------------------ */
test('Info.plist: GADApplicationIdentifier は本番アプリIDを「値で」固定する', () => {
  const entry = CONFIG_ENTRIES.find((item) => item.key === 'GADApplicationIdentifier');
  assert.ok(entry, 'GADApplicationIdentifier の設定がある');
  assert.equal(entry.mode, 'value', 'presence ではなく value（違えば書き換える）');
  assert.equal(entry.value, `<string>${PROD_APP_ID}</string>`);
});

test('Info.plist: ATT の説明文と SKAdNetworkItems がある', () => {
  const tracking = CONFIG_ENTRIES.find((item) => item.key === 'NSUserTrackingUsageDescription');
  assert.ok(tracking, 'NSUserTrackingUsageDescription がある');
  assert.equal(tracking.mode, 'value');
  assert.match(tracking.value, /広告識別子/);
  assert.match(tracking.value, /許可しない場合も/, '拒否しても機能が使えることを明記する');

  const skad = CONFIG_ENTRIES.find((item) => item.key === 'SKAdNetworkItems');
  assert.ok(skad, 'SKAdNetworkItems がある');
  assert.match(skad.value, /cstr6suwn9\.skadnetwork/);
});

test('Info.plist: config.js のアプリIDと configure-ios.js の値が一致する', () => {
  const config = loadConfig();
  const entry = CONFIG_ENTRIES.find((item) => item.key === 'GADApplicationIdentifier');
  assert.equal(entry.value, `<string>${config.ADMOB.APP_ID}</string>`);
});

/* ------------------------------------------------------------------ *
 * 7. 配線（読み込み順 / www 同期）
 * ------------------------------------------------------------------ */
test('配線: index.html が config.js → admob.js → app.js の順に読み込む', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const configIndex = html.indexOf('src="config.js"');
  const admobIndex = html.indexOf('src="admob.js?');
  const appIndex = html.indexOf('src="app.js?');

  assert.ok(configIndex > -1 && admobIndex > configIndex && appIndex > admobIndex, 'config → admob → app の順');
  assert.match(html, /admob\.js\?v=\d{8}v\d+/, 'キャッシュバスター付きで読み込む');
});

test('配線: app.js が AdMob バナーを起動し、失敗してもアプリを止めない', () => {
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert.match(app, /initAdMobBanner\(\)/);
  assert.match(app, /window\.Date15AdMob/);
  assert.match(app, /new api\.AdMobManager\(\)/);
});

test('ビルド: www/ の admob.js と config.js がルートと一致する（npm run build で同期）', () => {
  ['admob.js', 'config.js', 'index.html', 'app.js'].forEach((file) => {
    const wwwPath = path.join(ROOT, 'www', file);
    assert.ok(fs.existsSync(wwwPath), `www/${file} が存在する`);
    assert.equal(fs.readFileSync(wwwPath, 'utf8'), fs.readFileSync(path.join(ROOT, file), 'utf8'), `www/${file} がルートと同一`);
  });
});

test('ビルド: scripts/build.js が admob.js を www/ へコピーする', () => {
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build.js'), 'utf8');
  assert.match(build, /'admob\.js'/);
});
