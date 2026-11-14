/**
 * DATE-15 - scripts/configure-ios.js
 * Automatically configures iOS Info.plist for Capacitor.
 *
 * テリトリーウォークの TestFlight 実機検証で判明した落とし穴を先回りで反映:
 *   - 輸出コンプライアンス（ITSAppUsesNonExemptEncryption = false）を入れないと
 *     TestFlight のビルドが「輸出コンプライアンス情報がありません」で保留になり、
 *     自動配信されない。
 *
 * 冪等（何度実行しても同じ結果）で、既存キーの重複を作らず、
 * 値を更新すべきキーだけを更新する。テストからは configureContent() を直接呼べる。
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PLIST_PATH = process.env.IOS_PLIST_PATH
    ? path.resolve(process.env.IOS_PLIST_PATH)
    : path.join(ROOT_DIR, 'ios', 'App', 'App', 'Info.plist');

/**
 * ホーム画面（アイコンの下）に表示するアプリ名。
 * Xcode の PRODUCT_NAME（英語）とは別に、この日本語表示名を Info.plist に固定する。
 */
const APP_DISPLAY_NAME = '15文字デート';

/**
 * Info.plist に入れるべきキー一覧。
 *   mode: 'value'    … 値まで一致させる（違えば書き換える）
 *   mode: 'presence' … キーの存在だけ確認する（ユーザー側の追記を壊さない）
 */
const CONFIG_ENTRIES = [
    {
        // ホーム画面のアイコン下に出るアプリ名（値が違えば書き換える）
        key: 'CFBundleDisplayName',
        value: `<string>${APP_DISPLAY_NAME}</string>`,
        mode: 'value'
    },
    {
        // ステータスバーはアプリ側（StatusBar プラグイン）で制御する
        key: 'UIViewControllerBasedStatusBarAppearance',
        value: '<false/>',
        mode: 'presence'
    },
    {
        // 明るい背景（#FAF5F2）に合わせて黒文字のステータスバー
        key: 'UIStatusBarStyle',
        value: '<string>UIStatusBarStyleDarkContent</string>',
        mode: 'value'
    },
    {
        // 輸出コンプライアンス。Apple の暗号化（HTTPS）を使うだけで「非免除」ではないため false。
        // これを Info.plist に入れておくと、TestFlight のビルドが
        // 「輸出コンプライアンスがありません」で保留にならず自動配信される。
        key: 'ITSAppUsesNonExemptEncryption',
        value: '<false/>',
        mode: 'value'
    }
];

/* ------------------------------------------------------------------ *
 * XML ヘルパー
 * ------------------------------------------------------------------ */

/** 文字列中の key タグ出現回数 */
function countOccurrences(haystack, needle) {
    let count = 0;
    let index = haystack.indexOf(needle);
    while (index !== -1) {
        count += 1;
        index = haystack.indexOf(needle, index + needle.length);
    }
    return count;
}

/** 比較用に空白を正規化する */
function normalizeXml(xml) {
    return String(xml == null ? '' : xml).replace(/\s+/g, ' ').trim();
}

/**
 * `from`（= <key>…</key> の直後）から始まる要素の終端インデックスを返す。
 * 値が無い場合は `from` をそのまま返す。
 */
function findValueEnd(text, from) {
    let i = from;
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (text[i] !== '<') return from;

    const head = /^<([A-Za-z_][\w.-]*)([^>]*?)(\/?)>/.exec(text.slice(i));
    if (!head) return from;
    if (head[3] === '/') return i + head[0].length; // <false/> のような自己完結

    const tag = head[1];
    let depth = 1;
    let position = i + head[0].length;
    const tagRe = /<\/?([A-Za-z_][\w.-]*)([^>]*?)(\/?)>/g;
    tagRe.lastIndex = position;
    let match;
    while ((match = tagRe.exec(text))) {
        if (match[1] !== tag) continue;
        if (match[0].startsWith('</')) {
            depth -= 1;
            if (depth === 0) return tagRe.lastIndex;
        } else if (match[3] !== '/') {
            depth += 1;
        }
    }
    return from;
}

/** 同一キーの2件目以降（キー＋値）を削除する */
function dedupeKey(content, key) {
    const keyTag = `<key>${key}</key>`;
    let result = content;
    let first = true;
    let searchFrom = 0;
    for (;;) {
        const index = result.indexOf(keyTag, searchFrom);
        if (index === -1) break;
        if (first) {
            first = false;
            searchFrom = index + keyTag.length;
            continue;
        }
        // 2件目以降はキー〜値の終端まで（続く空白・改行を含めて）取り除く
        let end = findValueEnd(result, index + keyTag.length);
        if (end <= index + keyTag.length) end = index + keyTag.length;
        let start = index;
        // 行頭のインデントと直前の改行も一緒に消して空行を残さない
        while (start > 0 && (result[start - 1] === '\t' || result[start - 1] === ' ')) start -= 1;
        while (end < result.length && /[ \t]/.test(result[end])) end += 1;
        if (result[end] === '\n') end += 1;
        if (result[start - 1] === '\n' && result[end - 1] === '\n') start -= 1;
        result = result.slice(0, start) + result.slice(end);
        searchFrom = start;
    }
    return result;
}

/** キー1件分の XML を組み立てる */
function entryXml(entry) {
    return `\t<key>${entry.key}</key>\n\t${entry.value}`;
}

/**
 * Info.plist の文字列を設定済みの文字列にして返す（純粋関数）。
 * @returns {{content: string, modified: boolean, actions: Array}}
 */
function configureContent(input, entries = CONFIG_ENTRIES) {
    let content = input;
    const actions = [];

    for (const entry of entries) {
        const keyTag = `<key>${entry.key}</key>`;
        const occurrences = countOccurrences(content, keyTag);

        if (occurrences === 0) {
            const lastDictIndex = content.lastIndexOf('</dict>');
            if (lastDictIndex === -1) {
                actions.push({ key: entry.key, action: 'skipped-no-dict' });
                continue;
            }
            content = content.slice(0, lastDictIndex) + entryXml(entry) + '\n' + content.slice(lastDictIndex);
            actions.push({ key: entry.key, action: 'injected' });
            continue;
        }

        if (occurrences > 1) {
            content = dedupeKey(content, entry.key);
            actions.push({ key: entry.key, action: 'deduped' });
        }

        if (entry.mode !== 'value') {
            if (!actions.some((item) => item.key === entry.key)) {
                actions.push({ key: entry.key, action: 'verified' });
            }
            continue;
        }

        const keyEnd = content.indexOf(keyTag) + keyTag.length;
        const valueEnd = findValueEnd(content, keyEnd);
        const currentValue = valueEnd > keyEnd ? content.slice(keyEnd, valueEnd) : '';
        if (normalizeXml(currentValue) !== normalizeXml(entry.value)) {
            content = content.slice(0, keyEnd) + `\n\t${entry.value}` + content.slice(valueEnd);
            actions.push({ key: entry.key, action: 'updated' });
        } else if (!actions.some((item) => item.key === entry.key)) {
            actions.push({ key: entry.key, action: 'verified' });
        }
    }

    const modified = content !== input;
    return { content, modified, actions };
}

/** 出力後の Info.plist が条件を満たしているか確認する（書き込み検証） */
function verifyContent(content) {
    const problems = [];
    for (const entry of CONFIG_ENTRIES) {
        const keyTag = `<key>${entry.key}</key>`;
        const occurrences = countOccurrences(content, keyTag);
        if (occurrences !== 1) {
            problems.push(`<key>${entry.key}</key> が ${occurrences} 件あります（1件であるべき）`);
            continue;
        }
        if (entry.mode === 'value') {
            const keyEnd = content.indexOf(keyTag) + keyTag.length;
            const valueEnd = findValueEnd(content, keyEnd);
            const currentValue = valueEnd > keyEnd ? content.slice(keyEnd, valueEnd) : '';
            if (normalizeXml(currentValue) !== normalizeXml(entry.value)) {
                problems.push(`<key>${entry.key}</key> の値が想定と違います`);
            }
        }
    }
    // 鍵括弧の対応（壊れた XML を書いていないか）の簡易チェック
    const opens = (content.match(/<dict>/g) || []).length;
    const closes = (content.match(/<\/dict>/g) || []).length;
    if (opens !== closes) problems.push(`<dict> と </dict> の数が一致しません (${opens}/${closes})`);

    // 輸出コンプライアンスはこのアプリの要。明示的に点検する。
    if (!/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(content)) {
        problems.push('ITSAppUsesNonExemptEncryption が <false/> になっていません（TestFlight 自動配信の条件）');
    }

    return problems;
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function main() {
    console.log('[iOS Config] Checking iOS project configuration...');

    if (!fs.existsSync(PLIST_PATH)) {
        console.log('[iOS Config] Note: ios/App/App/Info.plist not found.');
        console.log('[iOS Config] If you haven\'t added iOS yet, run:');
        console.log('[iOS Config]   npx cap add ios');
        console.log('[iOS Config] Or simply:');
        console.log('[iOS Config]   npm run ios:setup');
        process.exit(0);
    }

    try {
        const original = fs.readFileSync(PLIST_PATH, 'utf8');
        const { content, modified, actions } = configureContent(original);

        for (const item of actions) {
            switch (item.action) {
                case 'injected':
                    console.log(`[iOS Config] Injected config: <key>${item.key}</key>`);
                    break;
                case 'updated':
                    console.log(`[iOS Config] Updated value for <key>${item.key}</key>`);
                    break;
                case 'deduped':
                    console.log(`[iOS Config] Removed duplicate entries for <key>${item.key}</key>`);
                    break;
                case 'skipped-no-dict':
                    console.log(`[iOS Config] Warning: no <dict> found, skipped <key>${item.key}</key>`);
                    break;
                default:
                    console.log(`[iOS Config] Verified: <key>${item.key}</key>`);
            }
        }

        if (modified) {
            fs.writeFileSync(PLIST_PATH, content, 'utf8');
            console.log('[iOS Config] Successfully updated Info.plist.');
        } else {
            console.log('[iOS Config] Info.plist is already fully configured.');
        }

        // 書き込み検証（実際にファイルへ書けた内容を読み直して点検する）
        const problems = verifyContent(fs.readFileSync(PLIST_PATH, 'utf8'));
        if (problems.length > 0) {
            problems.forEach((problem) => console.error(`[iOS Config] Verification failed: ${problem}`));
            process.exitCode = 1;
            return;
        }

        console.log(`[iOS Config] Home screen name: ${APP_DISPLAY_NAME}`);
        console.log('[iOS Config] Export compliance: ITSAppUsesNonExemptEncryption = false (TestFlight auto-delivery OK).');
    } catch (err) {
        console.error('[iOS Config] Error modifying Info.plist:', err);
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    CONFIG_ENTRIES,
    APP_DISPLAY_NAME,
    PLIST_PATH,
    configureContent,
    verifyContent,
    findValueEnd,
    dedupeKey,
    normalizeXml,
    entryXml,
    main
};
