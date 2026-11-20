/**
 * DATE-15 - Node tests
 * 荒らし対策（Issue #3〜#6）と本番広告切り替えの検証:
 *   1) NG判定の正規化（記号挟み・長音・半角カナ・全角英数・カタカナ/ひらがな）
 *   2) 語彙の拡充と、普通のデートプランが誤爆しないこと
 *   3) URL・メール・電話番号の投稿ブロック
 *   4) 連投制限（同一端末60秒）と端末ID
 *   5) 通報の記録（date_plan_reports）と、通報した投稿の即時非表示
 *   6) hidden（非表示）の投稿は一覧・ルーレットから除外
 *   7) サーバー側 SQL の語彙・しきい値がクライアントと一致していること
 *   8) 本番広告（USE_TEST_ADS: false）と本番ユニットID
 *
 * 実行: npm test （node --test tests/）
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const NG = require(path.join(ROOT, 'ng-check.js'));
const Guard = require(path.join(ROOT, 'guard.js'));

const HTML = read('index.html');
const APP_JS = read('app.js');
const SQL = read('supabase/migrations/20261121_anti_abuse.sql');

/* ------------------------------------------------------------------ *
 * 1. NG判定の正規化
 * ------------------------------------------------------------------ */
test('正規化: 記号・中点・長音・空白を落として同じ形にする', () => {
    assert.equal(NG.normalize('セ・ックス'), 'せっくす');
    assert.equal(NG.normalize('セーックス'), 'せっくす');
    assert.equal(NG.normalize('せ っ く す'), 'せっくす');
    assert.equal(NG.normalize('せ　っ　く　す'), 'せっくす');
    assert.equal(NG.normalize('ｾｯｸｽ'), 'せっくす');
    assert.equal(NG.normalize('セックス'), NG.normalize('せっくす'));
});

test('NG判定: 表記ゆれをすり抜けさせない', () => {
    ['セックス', 'セ・ックス', 'セーックス', 'ｾｯｸｽ', 'せっくす', 'せ・っ・く・す'].forEach((text) => {
        assert.equal(NG.hasSensitiveWord(text), true, `${text} は弾く`);
    });
    ['死ね', 'しね', 'ころす', '闇バイト', 'パパ活', 'レイプ'].forEach((text) => {
        assert.equal(NG.hasSensitiveWord(text), true, `${text} は弾く`);
    });
});

test('NG判定: 普通のデートプランは誤爆しない', () => {
    const presets = [
        '散歩中の可愛い犬を数えて歩こう',
        '古本屋で五百円分選び合ってみる',
        '昔ながらの駄菓子屋で三百円豪遊',
        'レンタルビデオでジャケ買い勝負',
        'ガチャガチャを二人でフルコンプ',
        '深夜のドライブで静かな海を見に',
        'デパ地下試食コーナー全種類制覇',
        'ボードゲームカフェで真剣勝負す',
        '見知らぬ駅でふらり途中下車する',
        '早朝の市場で熱い朝ラーメン食う'
    ];
    presets.forEach((text) => {
        assert.equal(NG.hasSensitiveWord(text), false, `${text} は通す`);
        assert.equal(NG.inspect(text).blocked, false, `${text} は投稿できる`);
    });
    // 日常語（成功・作業・したい）がNG語に巻き込まれていないこと
    ['成功を祈る二人', '作業を終えて会いに行く', '海に行きたいと伝える'].forEach((text) => {
        assert.equal(NG.hasSensitiveWord(text), false, `${text} は通す`);
    });
});

test('URL・連絡先: リンクやメール・電話番号は投稿させない', () => {
    assert.equal(NG.hasLink('https://example.com'), true);
    assert.equal(NG.hasLink('www.example.com'), true);
    assert.equal(NG.hasLink('example.com'), true);
    assert.equal(NG.hasLink('me@example.com'), true);
    assert.equal(NG.hasLink('09012345678'), true);
    assert.equal(NG.hasLink('3時に駅で待ち合わせ'), false);
    assert.equal(NG.hasLink('古本屋で五百円分選び合う'), false);
});

/* ------------------------------------------------------------------ *
 * 2. 連投制限・端末ID・通報
 * ------------------------------------------------------------------ */
function memoryStorage() {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: (k) => map.delete(k),
        _map: map
    };
}

test('連投制限: 60秒に1回。残り秒数を返す', () => {
    const storage = memoryStorage();
    const now = 1_800_000_000_000;

    assert.deepEqual(Guard.checkPostCooldown(storage, now), { allowed: true, remainingMs: 0, remainingSec: 0 });

    Guard.markPosted(storage, now);
    const justAfter = Guard.checkPostCooldown(storage, now + 1000);
    assert.equal(justAfter.allowed, false);
    assert.equal(justAfter.remainingSec, 59);

    assert.equal(Guard.checkPostCooldown(storage, now + 59_000).allowed, false);
    assert.equal(Guard.checkPostCooldown(storage, now + 60_000).allowed, true);
});

test('端末ID: 同じ端末では同じIDを返し、未作成なら作って保存する', () => {
    const storage = memoryStorage();
    const cryptoStub = { randomUUID: () => 'uuid-fixed-1' };
    const id1 = Guard.getDeviceId(storage, cryptoStub);
    const id2 = Guard.getDeviceId(storage, cryptoStub);
    assert.equal(id1, 'uuid-fixed-1');
    assert.equal(id2, id1);
    assert.equal(storage.getItem(Guard.KEY_DEVICE_ID), id1);
});

test('通報: 送信内容と、同一プランの二重通報の抑止', () => {
    const storage = memoryStorage();
    const payload = Guard.buildReportPayload({ planId: 42, deviceId: 'dev-1' });
    assert.deepEqual(payload, { plan_id: 42, reason: 'inappropriate', device_id: 'dev-1' });

    assert.equal(Guard.hasReported(storage, 42), false);
    Guard.markReported(storage, 42);
    assert.equal(Guard.hasReported(storage, 42), true);
    assert.equal(Guard.hasReported(storage, '42'), true, '文字列IDでも同じ扱い');
});

/* ------------------------------------------------------------------ *
 * 3. app.js の組み込み（jsdom）
 * ------------------------------------------------------------------ */
function createAppPage(options = {}) {
    const dom = new JSDOM(HTML, { url: 'https://example.test/', runScripts: 'outside-only' });
    const { window } = dom;
    const calls = [];
    const alerts = [];

    window.alert = (message) => alerts.push(String(message));
    window.confirm = () => options.confirm !== false;
    window.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), init });
        if (typeof options.fetch === 'function') return options.fetch(String(url), init);
        return { ok: true, json: async () => [], text: async () => '' };
    };

    // ネイティブ広告・タブは今回の検証対象外（Webブラウザ相当）
    window.Date15AdMob = undefined;
    window.Date15Tabs = undefined;

    ['config.js', 'ng-check.js', 'guard.js', 'app.js'].forEach((file) => {
        window.eval(read(file));
    });
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    return { window, dom, calls, alerts };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const remoteRow = (overrides = {}) => Object.assign({
    id: 1,
    text: '古本屋で五百円分選び合ってみる',
    author: '匿名希望',
    likes: 3,
    hidden: false,
    created_at: '2026-11-20T00:00:00.000Z'
}, overrides);

test('除外: hidden=true の投稿は一覧とルーレットの母数から外れる', async () => {
    const hiddenText = '非表示にした投稿のテキスト';
    const page = createAppPage({
        fetch: async () => ({
            ok: true,
            json: async () => [remoteRow({ id: 1 }), remoteRow({ id: 2, text: hiddenText, hidden: true })],
            text: async () => ''
        })
    });
    await flush();

    const visible = page.window.Date15App.visiblePlans();
    assert.deepEqual(visible.map((p) => p.id), [1]);
    assert.equal(page.window.document.getElementById('rouletteTotalCount').textContent, '1');
    const listText = page.window.document.getElementById('plansContainer').textContent;
    assert.equal(listText.includes(hiddenText), false, '非表示の投稿は一覧に出ない');
});

test('通報: date_plan_reports に1件記録し、その場で一覧から消す', async () => {
    const page = createAppPage({
        fetch: async (url, init) => {
            if (init && init.method === 'POST') return { ok: true, json: async () => ({}), text: async () => '' };
            return { ok: true, json: async () => [remoteRow({ id: 7 })], text: async () => '' };
        }
    });
    await flush();

    const ok = await page.window.Date15App.reportPlan(7);
    assert.equal(ok, true);

    const post = page.calls.find((c) => c.init && c.init.method === 'POST');
    assert.ok(post, '通報POSTが送られる');
    assert.ok(post.url.includes('date_plan_reports'), '通報テーブルへ送る');
    const body = JSON.parse(post.init.body);
    assert.equal(body.plan_id, 7);
    assert.ok(body.device_id, '端末IDを付ける');

    assert.deepEqual(page.window.Date15App.visiblePlans(), [], '通報した投稿は自分の一覧から消える');
});

test('通報: キャンセルしたら送らない・消さない', async () => {
    const page = createAppPage({
        confirm: false,
        fetch: async () => ({ ok: true, json: async () => [remoteRow({ id: 9 })], text: async () => '' })
    });
    await flush();

    const ok = await page.window.Date15App.reportPlan(9);
    assert.equal(ok, false);
    assert.equal(page.calls.filter((c) => c.init && c.init.method === 'POST').length, 0);
    assert.equal(page.window.Date15App.visiblePlans().length, 1);
});

test('連投制限: 直前に投稿していれば submitPlan は送らずに待たせる', async () => {
    const page = createAppPage();
    await flush();

    const now = Date.now();
    page.window.localStorage.setItem(Guard.KEY_LAST_POST, String(now));

    const input = page.window.document.getElementById('planInput');
    input.value = 'あ'.repeat(15);
    const before = page.calls.length;
    await page.window.Date15App.submitPlan();

    assert.equal(page.calls.length, before, 'サーバーへは送らない');
    assert.ok(page.alerts.some((m) => m.includes('秒')), '残り秒数を伝える');
});

test('投稿: NGワード（記号挟み）は送信前に止める', async () => {
    const page = createAppPage();
    await flush();

    const input = page.window.document.getElementById('planInput');
    input.value = 'せ・っ・く・す' + 'あ'.repeat(7); // 記号抜きで15文字相当
    const before = page.calls.length;
    await page.window.Date15App.submitPlan();

    assert.equal(page.calls.length, before);
    assert.ok(page.alerts.some((m) => m.includes('不適切')), '不適切として止める');
});

test('投稿: 正常な15文字はそのまま投稿できる（ローカル保存）', async () => {
    const page = createAppPage();
    await flush();

    const input = page.window.document.getElementById('planInput');
    input.value = '古本屋で五百円分選び合ってみる';
    await page.window.Date15App.submitPlan();

    assert.ok(page.alerts.some((m) => m.includes('投稿しました')));
    assert.equal(page.window.Date15App.getPlans().length, 11, '初期10件＋投稿1件');
});

/* ------------------------------------------------------------------ *
 * 4. サーバー側 SQL との一致
 * ------------------------------------------------------------------ */
test('SQL: ワードリストが ng-check.js と完全に一致する', () => {
    const match = SQL.match(/select array\[([\s\S]*?)\]::text\[\]/);
    assert.ok(match, 'date15_ng_words の配列がある');
    const sqlWords = match[1]
        .split(',')
        .map((w) => w.trim().replace(/^'/, '').replace(/'$/, ''))
        .filter(Boolean);

    assert.deepEqual(new Set(sqlWords), new Set(NG.NORMALIZED_WORDS),
        '片側だけ語彙を足すと素通りするため一致させる');
});

test('SQL: サーバー側チェック（NG/連投/長さ/通報で自動非表示）が定義されている', () => {
    assert.match(SQL, /add column if not exists hidden boolean not null default false/);
    assert.match(SQL, /add column if not exists device_id text/);
    assert.match(SQL, /create trigger date15_guard_plan_trg\s+before insert on public\.date_plans/);
    assert.match(SQL, /interval '60 seconds'/);
    assert.match(SQL, /date15_ng/);
    assert.match(SQL, /date15_link/);
    assert.match(SQL, /date15_rate_limited/);
    assert.match(SQL, /create table if not exists public\.date_plan_reports/);
    assert.match(SQL, /if cnt >= 3 then/);
    assert.match(SQL, /set hidden = true/);
    assert.match(SQL, /enable row level security/);
});

test('アプリ: NG判定を ng-check.js に委ね、判定不能なら投稿させない', () => {
    assert.equal(APP_JS.includes("const SENSITIVE_WORDS = ["), false, '語彙の二重管理をやめる');
    assert.match(APP_JS, /window\.Date15NG/);
    assert.match(APP_JS, /window\.Date15Guard/);
    assert.match(APP_JS, /if \(!NG \|\| typeof NG\.hasSensitiveWord !== 'function'\) return true;/);
});

/* ------------------------------------------------------------------ *
 * 5. 本番広告への切り替え
 * ------------------------------------------------------------------ */
test('広告: 本番ビルドは USE_TEST_ADS: false で、本番ユニットIDが設定されている', () => {
    const sandbox = { window: {} };
    const vm = require('node:vm');
    vm.createContext(sandbox);
    vm.runInContext(read('config.js'), sandbox);
    const ad = sandbox.window.DATE_CONFIG.ADMOB;

    assert.equal(ad.USE_TEST_ADS, false, '本番広告に切り替わっている');
    assert.equal(ad.APP_ID, 'ca-app-pub-5739782559889389~9293414856');
    assert.equal(ad.BANNER_AD_ID, 'ca-app-pub-5739782559889389/5354169841');
    assert.equal(read('www/config.js'), read('config.js'), 'www/ も同じ設定');
});

test('広告: GoogleのサンプルIDが出荷コードに残っていない（www/ 含む）', () => {
    ['config.js', 'admob.js', 'www/config.js', 'www/admob.js'].forEach((file) => {
        assert.equal(read(file).includes('ca-app-pub-3940256099942544'), false, `${file}`);
    });
});
