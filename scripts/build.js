/**
 * DATE-15 - scripts/build.js
 * Synchronizes web assets to www/ for Capacitor iOS build
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WWW_DIR = path.join(ROOT_DIR, 'www');

console.log('[Build] Synchronizing web assets to www/...');

if (!fs.existsSync(WWW_DIR)) {
  fs.mkdirSync(WWW_DIR, { recursive: true });
}

// Files and extensions to copy
const COPY_FILES = [
  'index.html',
  'app.js',
  'config.js',
  'privacy.html',
  'terms.html',
  'support.html',
  'favicon.png',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png'
];

let count = 0;
for (const file of COPY_FILES) {
  const src = path.join(ROOT_DIR, file);
  const dest = path.join(WWW_DIR, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    count++;
  }
}

console.log(`[Build] Successfully synchronized ${count} files to www/!`);
