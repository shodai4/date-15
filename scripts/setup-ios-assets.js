/**
 * DATE-15 - scripts/setup-ios-assets.js
 * Automatically copies generated iOS AppIcon asset catalog to Xcode project.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT_DIR, 'resources', 'AppIcon.appiconset');
const DEST_DIR = path.join(ROOT_DIR, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset');

console.log('[iOS Assets] Checking iOS asset catalog synchronization...');

if (!fs.existsSync(DEST_DIR)) {
  console.log('[iOS Assets] Note: Xcode Assets.xcassets not found yet.');
  console.log('[iOS Assets] Run "npm run cap:add" or "npm run ios:setup" first.');
  process.exit(0);
}

try {
  if (fs.existsSync(SRC_DIR)) {
    const files = fs.readdirSync(SRC_DIR);
    for (const file of files) {
      const srcFile = path.join(SRC_DIR, file);
      const destFile = path.join(DEST_DIR, file);
      fs.copyFileSync(srcFile, destFile);
    }
    console.log(`[iOS Assets] Successfully synchronized ${files.length} icon files to Xcode AppIcon.appiconset!`);
  }
} catch (err) {
  console.error('[iOS Assets] Error copying assets to Xcode:', err);
}
