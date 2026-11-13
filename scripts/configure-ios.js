/**
 * DATE-15 - scripts/configure-ios.js
 * Automatically configures iOS Info.plist for Capacitor.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PLIST_PATH = path.join(ROOT_DIR, 'ios', 'App', 'App', 'Info.plist');

console.log('[iOS Config] Checking iOS project configuration...');

if (!fs.existsSync(PLIST_PATH)) {
    console.log('[iOS Config] Note: ios/App/App/Info.plist not found.');
    console.log('[iOS Config] If you haven\'t added iOS yet, run:');
    console.log('[iOS Config]   npm run ios:setup');
    process.exit(0);
}

try {
    let content = fs.readFileSync(PLIST_PATH, 'utf8');
    let modified = false;

    const CONFIG_ENTRIES = [
        {
            key: 'CFBundleDisplayName',
            val: '15文字デート',
            xml: '\t<key>CFBundleDisplayName</key>\n\t<string>15文字デート</string>'
        },
        {
            key: 'UIViewControllerBasedStatusBarAppearance',
            val: '<false/>',
            xml: '\t<key>UIViewControllerBasedStatusBarAppearance</key>\n\t<false/>'
        },
        {
            key: 'UIStatusBarStyle',
            val: 'UIStatusBarStyleDarkContent',
            xml: '\t<key>UIStatusBarStyle</key>\n\t<string>UIStatusBarStyleDarkContent</string>'
        }
    ];

    for (const entry of CONFIG_ENTRIES) {
        if (!content.includes(`<key>${entry.key}</key>`)) {
            const lastDictIndex = content.lastIndexOf('</dict>');
            if (lastDictIndex !== -1) {
                content = content.slice(0, lastDictIndex) + entry.xml + '\n' + content.slice(lastDictIndex);
                console.log(`[iOS Config] Injected config: <key>${entry.key}</key>`);
                modified = true;
            }
        } else if (entry.val) {
            const regex = new RegExp(`<key>${entry.key}<\\/key>\\s*<string>([^<]*)<\\/string>`, 'm');
            const match = content.match(regex);
            if (match && match[1] !== entry.val) {
                content = content.replace(regex, `<key>${entry.key}</key>\n\t<string>${entry.val}</string>`);
                console.log(`[iOS Config] Updated <key>${entry.key}</key> to "${entry.val}"`);
                modified = true;
            }
        }
    }

    if (modified) {
        fs.writeFileSync(PLIST_PATH, content, 'utf8');
        console.log('[iOS Config] Successfully updated Info.plist!');
    } else {
        console.log('[iOS Config] Info.plist is already fully configured.');
    }

} catch (err) {
    console.error('[iOS Config] Error modifying Info.plist:', err);
}
