/**
 * DATE-15 - scripts/generate-ng-sql.js
 * ng-check.js の NGワード（正規化済み）を、Supabase マイグレーションSQLの
 * date15_ng_words() 配列へ書き写す。
 *
 *   node scripts/generate-ng-sql.js          … SQLを更新
 *   node scripts/generate-ng-sql.js --check  … 差分があれば終了コード1（CI用）
 *
 * ブラウザ側（ng-check.js）とサーバー側（SQL）で語彙がずれると、
 * 片側だけ素通りする穴になるので、生成と検証を1か所にまとめる。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SQL_PATH = path.join(ROOT, 'supabase', 'migrations', '20261121_anti_abuse.sql');
const NG = require(path.join(ROOT, 'ng-check.js'));

const WORDS_PER_LINE = 7;

function formatArray(words) {
  const lines = [];
  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    const chunk = words.slice(i, i + WORDS_PER_LINE).map((w) => `'${w}'`).join(', ');
    lines.push('    ' + chunk + (i + WORDS_PER_LINE < words.length ? ',' : ''));
  }
  return 'select array[\n' + lines.join('\n') + '\n  ]::text[];';
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  const pattern = /select array\[[\s\S]*?\]::text\[\];/;

  if (!pattern.test(sql)) {
    console.error('[ng:sql] date15_ng_words() の配列が見つかりません');
    process.exit(1);
  }

  const next = sql.replace(pattern, formatArray(NG.NORMALIZED_WORDS));
  if (next === sql) {
    console.log(`[ng:sql] 最新です（${NG.NORMALIZED_WORDS.length}語）`);
    return;
  }
  if (checkOnly) {
    console.error('[ng:sql] 差分があります。node scripts/generate-ng-sql.js で更新してください');
    process.exit(1);
  }
  fs.writeFileSync(SQL_PATH, next);
  console.log(`[ng:sql] 更新しました（${NG.NORMALIZED_WORDS.length}語）`);
}

main();
