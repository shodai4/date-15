/**
 * DATE-15 - Node tests
 * scripts/configure-ios.js が Info.plist に
 * ITSAppUsesNonExemptEncryption = false（輸出コンプライアンス）を
 * 冪等に注入し、既存設定を壊さないことを検証する。
 *
 * 実行: npm test （node --test tests/）
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'configure-ios.js');
const { configureContent, verifyContent, CONFIG_ENTRIES, APP_DISPLAY_NAME } = require(SCRIPT);

const KEY = 'ITSAppUsesNonExemptEncryption';

/* ------------------------------------------------------------------ *
 * Capacitor 6 の iOS テンプレートに近い Info.plist
 * ------------------------------------------------------------------ */
function templatePlist(extra = '') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>en</string>
\t<key>CFBundleDisplayName</key>
\t<string>App</string>
\t<key>CFBundleExecutable</key>
\t<string>$(EXECUTABLE_NAME)</string>
\t<key>CFBundleIdentifier</key>
\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundlePackageType</key>
\t<string>APPL</string>
\t<key>CFBundleShortVersionString</key>
\t<string>1.0</string>
\t<key>CFBundleVersion</key>
\t<string>1</string>
\t<key>LSRequiresIPhoneOS</key>
\t<true/>
\t<key>UIApplicationSceneManifest</key>
\t<dict>
\t\t<key>UIApplicationSupportsMultipleScenes</key>
\t\t<false/>
\t\t<key>UISceneConfigurations</key>
\t\t<dict>
\t\t\t<key>UISceneConfigurationName</key>
\t\t\t<string>Default Configuration</string>
\t\t</dict>
\t</dict>
\t<key>UILaunchStoryboardName</key>
\t<string>LaunchScreen</string>
\t<key>UIRequiredDeviceCapabilities</key>
\t<array>
\t\t<string>armv7</string>
\t</array>
${extra}</dict>
</plist>
`;
}

/** キーの出現回数 */
function countKey(xml, key) {
    return xml.split(`<key>${key}</key>`).length - 1;
}

/** Info.plist を python3 の plistlib で読み、オブジェクトとして返す（無ければ null） */
function readPlistWithPython(filePath) {
    try {
        const out = execFileSync(
            'python3',
            ['-c', 'import json,plistlib,sys;print(json.dumps(plistlib.load(open(sys.argv[1],"rb")),ensure_ascii=False,default=str))', filePath],
            { stdio: ['ignore', 'pipe', 'pipe'] }
        );
        return JSON.parse(out.toString('utf8'));
    } catch (err) {
        if (err && (err.code === 'ENOENT' || err.status === 127)) return null;
        throw err;
    }
}

function hasPython() {
    try {
        execFileSync('python3', ['-c', 'import plistlib'], { stdio: 'ignore' });
        return true;
    } catch (err) {
        return false;
    }
}

/* ------------------------------------------------------------------ *
 * 1. 注入
 * ------------------------------------------------------------------ */
test('輸出コンプライアンス: 未設定なら <key>ITSAppUsesNonExemptEncryption</key><false/> を注入する', () => {
    const before = templatePlist();
    assert.equal(countKey(before, KEY), 0);

    const { content, modified, actions } = configureContent(before);

    assert.equal(modified, true);
    assert.equal(countKey(content, KEY), 1, 'キーは1件だけ');
    assert.match(content, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
    assert.ok(actions.some((item) => item.key === KEY && item.action === 'injected'));
    assert.deepEqual(verifyContent(content), []);
});

test('輸出コンプライアンス: 注入先はルート dict で、入れ子の dict の中に入らない', () => {
    const { content } = configureContent(templatePlist());
    const rootClose = content.lastIndexOf('</dict>');
    const keyIndex = content.indexOf(`<key>${KEY}</key>`);

    assert.ok(keyIndex > 0);
    assert.ok(keyIndex < rootClose, 'キーはルート dict の閉じタグより前');
    // 入れ子の UIApplicationSceneManifest ブロックより後ろ（＝ルート直下）に置かれている
    assert.ok(keyIndex > content.indexOf('<key>UIApplicationSceneManifest</key>'));
    assert.ok(keyIndex > content.indexOf('<key>UILaunchStoryboardName</key>'));
});

test('表示名: Capacitor テンプレートの "App" を日本語のアプリ名に直す', () => {
    const { content } = configureContent(templatePlist());
    assert.match(content, new RegExp(`<key>CFBundleDisplayName<\\/key>\\s*<string>${APP_DISPLAY_NAME}</string>`));
    assert.doesNotMatch(content, /<key>CFBundleDisplayName<\/key>\s*<string>App<\/string>/);
});

/* ------------------------------------------------------------------ *
 * 2. 冪等性・重複排除
 * ------------------------------------------------------------------ */
test('冪等性: 2回続けて実行しても出力が変わらず、キーも1件のまま', () => {
    const first = configureContent(templatePlist());
    const second = configureContent(first.content);

    assert.equal(second.content, first.content);
    assert.equal(second.modified, false, '2回目は書き換えなし');
    assert.equal(countKey(second.content, KEY), 1);
    assert.ok(second.actions.every((item) => item.action === 'verified' || item.action === 'deduped'));
});

test('重複排除: 同じキーが複数あっても1件にまとめる', () => {
    const duplicated = templatePlist(`\t<key>${KEY}</key>\n\t<false/>\n\t<key>${KEY}</key>\n\t<false/>\n`);
    assert.equal(countKey(duplicated, KEY), 2);

    const { content, actions } = configureContent(duplicated);

    assert.equal(countKey(content, KEY), 1);
    assert.ok(actions.some((item) => item.key === KEY && item.action === 'deduped'));
    assert.match(content, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
    assert.deepEqual(verifyContent(content), []);
});

test('重複排除: 値つきの重複（<string> など）でも壊さず1件にまとめる', () => {
    const duplicated = templatePlist(
        `\t<key>CFBundleDisplayName</key>\n\t<string>15文字デート</string>\n\t<key>CFBundleDisplayName</key>\n\t<string>App</string>\n`
    );
    const { content } = configureContent(duplicated);

    assert.equal(countKey(content, 'CFBundleDisplayName'), 1);
    assert.match(content, /<key>CFBundleDisplayName<\/key>\s*<string>15文字デート<\/string>/);
    assert.doesNotMatch(content, /<string>App<\/string>/);
    assert.deepEqual(verifyContent(content), []);
});

test('値の訂正: 既に <true/> で入っていても <false/> に直す', () => {
    const wrong = templatePlist(`\t<key>${KEY}</key>\n\t<true/>\n`);
    const { content, actions } = configureContent(wrong);

    assert.match(content, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
    assert.equal(countKey(content, KEY), 1);
    assert.doesNotMatch(content, new RegExp(`<key>${KEY}</key>\\s*<true/>`));
    assert.ok(actions.some((item) => item.key === KEY && item.action === 'updated'));
    assert.deepEqual(verifyContent(content), []);
});

/* ------------------------------------------------------------------ *
 * 3. 既存設定を壊さない
 * ------------------------------------------------------------------ */
test('既存設定の保護: 手で足した UIBackgroundModes や NS* を上書きしない', () => {
    const extra = `\t<key>UIBackgroundModes</key>
\t<array>
\t\t<string>audio</string>
\t</array>
\t<key>NSCameraUsageDescription</key>
\t<string>手で足した説明</string>
`;
    const { content } = configureContent(templatePlist(extra));

    assert.match(content, /<string>audio<\/string>/, '追加済みバックグラウンドモードが残る');
    assert.match(content, /手で足した説明/, '手動で足したキーが残る');
    assert.equal(countKey(content, 'UIBackgroundModes'), 1);
    assert.equal(countKey(content, KEY), 1);
});

test('ステータスバー: 既存の値を尊重しつつ、キーは1件に保つ', () => {
    const raw = templatePlist(
        `\t<key>UIViewControllerBasedStatusBarAppearance</key>\n\t<false/>\n\t<key>UIStatusBarStyle</key>\n\t<string>UIStatusBarStyleLightContent</string>\n`
    );
    const { content } = configureContent(raw);

    assert.equal(countKey(content, 'UIViewControllerBasedStatusBarAppearance'), 1);
    assert.equal(countKey(content, 'UIStatusBarStyle'), 1);
    // 明るい背景のアプリなので、暗い文字のステータスバーに揃える
    assert.match(content, /<key>UIStatusBarStyle<\/key>\s*<string>UIStatusBarStyleDarkContent<\/string>/);
});

test('検証: キーが欠けていれば verifyContent が問題を返す', () => {
    const problems = verifyContent(templatePlist());
    assert.ok(problems.length > 0);
    assert.ok(problems.some((problem) => problem.includes(KEY)));
});

test('検証: dict の数が合わない（壊れた XML）なら問題を返す', () => {
    const broken = `<plist version="1.0">\n<dict>\n\t<key>${KEY}</key>\n\t<false/>\n</dict>\n</dict>\n`;
    const problems = verifyContent(broken);
    assert.ok(problems.some((problem) => problem.includes('<dict>')));
});

/* ------------------------------------------------------------------ *
 * 4. CLI（実際にファイルを書き換える）
 * ------------------------------------------------------------------ */
test('CLI: Info.plist を書き換え、plistlib で読んでも false になっている', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd15-ios-config-'));
    const plistPath = path.join(dir, 'Info.plist');
    try {
        fs.writeFileSync(plistPath, templatePlist(), 'utf8');

        const out = execFileSync(process.execPath, [SCRIPT], {
            env: { ...process.env, IOS_PLIST_PATH: plistPath },
            stdio: ['ignore', 'pipe', 'pipe']
        }).toString('utf8');

        assert.match(out, /Injected config: <key>ITSAppUsesNonExemptEncryption<\/key>/);
        assert.match(out, /Export compliance: ITSAppUsesNonExemptEncryption = false/);

        const written = fs.readFileSync(plistPath, 'utf8');
        assert.match(written, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);

        if (hasPython()) {
            const parsed = readPlistWithPython(plistPath);
            assert.ok(parsed, 'plistlib で読める（壊れていない XML）');
            assert.equal(parsed[KEY], false, 'plist として読んで false');
            assert.equal(parsed.CFBundleDisplayName, APP_DISPLAY_NAME, 'ホーム画面のアプリ名は日本語');
            assert.ok(parsed.UIApplicationSceneManifest, '入れ子 dict も保たれている');
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('CLI: 2回目の実行では書き換えず「already fully configured」で終わる', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd15-ios-config-'));
    const plistPath = path.join(dir, 'Info.plist');
    try {
        fs.writeFileSync(plistPath, templatePlist(), 'utf8');
        execFileSync(process.execPath, [SCRIPT], {
            env: { ...process.env, IOS_PLIST_PATH: plistPath },
            stdio: 'pipe'
        });
        const afterFirst = fs.readFileSync(plistPath, 'utf8');

        const out = execFileSync(process.execPath, [SCRIPT], {
            env: { ...process.env, IOS_PLIST_PATH: plistPath },
            stdio: ['ignore', 'pipe', 'pipe']
        }).toString('utf8');

        assert.match(out, /already fully configured/);
        assert.equal(fs.readFileSync(plistPath, 'utf8'), afterFirst);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('CLI: ios プロジェクトが無いときは何もせず正常終了する', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd15-ios-config-'));
    try {
        const out = execFileSync(process.execPath, [SCRIPT], {
            env: { ...process.env, IOS_PLIST_PATH: path.join(dir, 'missing', 'Info.plist') },
            stdio: ['ignore', 'pipe', 'pipe']
        }).toString('utf8');
        assert.match(out, /Info\.plist not found/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

/* ------------------------------------------------------------------ *
 * 5. 配線の回帰チェック（この設定が実際にビルド経路を通るか）
 * ------------------------------------------------------------------ */
test('配線: package.json の cap:add / cap:sync / ios:setup / ios:config が configure-ios.js を実行する', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    ['cap:add', 'cap:sync', 'ios:setup', 'ios:config'].forEach((name) => {
        assert.match(pkg.scripts[name], /node scripts\/configure-ios\.js/, `${name} が configure-ios.js を通る`);
    });
    assert.match(pkg.scripts.test, /node --test tests\//);
});

test('配線: iOS ビルド手順（ci/ios-build.yml）がテストと configure-ios.js を実行する', () => {
    const workflow = fs.readFileSync(path.join(ROOT, 'ci', 'ios-build.yml'), 'utf8');
    assert.match(workflow, /npm test/);
    assert.match(workflow, /node scripts\/configure-ios\.js/);

    const configureIndex = workflow.indexOf('node scripts/configure-ios.js');
    const buildIndex = workflow.indexOf('Clean & Compile iOS App');
    assert.ok(configureIndex > 0 && buildIndex > configureIndex, '設定はビルドより前に行われる');
});

test('配線: App Store 提出手順書が輸出コンプライアンスの自動設定に触れている', () => {
    const guide = fs.readFileSync(path.join(ROOT, 'docs', 'app-store-release-guide.md'), 'utf8');
    assert.match(guide, /ITSAppUsesNonExemptEncryption/);
});
