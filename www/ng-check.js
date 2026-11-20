/**
 * DATE-15 - ng-check.js
 * NGワード判定の共通ロジック（ブラウザ／単体テスト共通）
 *
 * 【表記ゆれ対策】
 *   normalize() で次の順に正規化してから部分一致で判定する。
 *     1) NFKC 正規化（全角英数→半角、半角カナ→全角カナ）
 *     2) 小文字化
 *     3) カタカナ→ひらがな（「セックス」「せっくす」を同じ形にする）
 *     4) 英数字・かな・漢字以外（空白・記号・中点・長音「ー」など）を全部除去
 *   これで「セ・ックス」「セーックス」「ｾｯｸｽ」「せ っ く す」も同じ「せっくす」になる。
 *
 * 【サーバー側との共通化】
 *   Supabase の DB トリガー（supabase/migrations/*.sql）は同じ正規化と同じ語彙を
 *   SQL 側に持つ。語彙がずれると片側だけ素通りするため、
 *   tests/moderation.test.js が「ng-check.js の語彙」と「SQL の語彙」の一致を検証する。
 *   語彙を足すときは ng-check.js を直し、`npm run ng:sql` で SQL を再生成する。
 *
 * 【URL・連絡先の投稿ブロック】
 *   15文字のデートプランにURLや連絡先が要る場面はないため、
 *   リンク・メールアドレス・電話番号らしき文字列は投稿させない。
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.Date15NG = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * NGワード（カテゴリ別）
   * 正規化後に突き合わせるので、ひらがな・カタカナどちらで書いてもよい。
   * 短すぎる語（「はげ」「さぎ」など）は普通の文章に誤爆するため入れない。
   */
  const CATEGORIES = {
    // 性的・露骨・風俗
    sexual: [
      'せっくす', 'おなにー', 'ふうぞく', 'でりへる', 'そーぷ', 'ちんこ', 'まんこ',
      'きょにゅう', 'えろ', 'えんこう', 'ぱぱかつ', 'ばいしゅん', 'かいしゅん',
      'やりまん', 'どうてい', 'しょじょ', 'おっぱい', 'しゃせい',
      'ぱぱ活',
      'ちかん', 'とうさつ', 'へんたい', 'せいこうい', 'ふぇら', 'ごうかん', 'れいぷ',
      'ぱいぱん', 'ぬーど', 'らぶほ', 'せふれ', 'いんらん', 'ふしだら', 'おなぽこ',
      'ろりこん', 'しょたこん', 'みせいねん', 'ぱんてぃ', 'ぶらじゃー',
      '風俗', '援交', '買春', '売春', '巨乳', '性交', '射精', '痴漢', '盗撮',
      '変態', '強姦', '性行為',
      'sex', 'fuck', 'porn', 'nude', 'penis', 'vagina'
    ],
    // 暴力・脅迫・自傷
    violence: [
      'しね', 'ころす', 'ころせ', 'じさつ', 'くびつり', 'なぐる', 'ぎゃくたい',
      'しんじゃえ', 'ばくはつ', 'さつがい', 'かいじょ', 'ころし',
      '死ね', '殺す', '殺せ', '自殺', '首吊り', '殴る', '虐待',
      'kill'
    ],
    // 誹謗中傷・差別
    abuse: [
      'がいじ', 'きちがい', 'ぶす', 'ぶさいく', 'きもちわる', 'まぬけ',
      'めくら', 'つんぼ', 'きもい',
      'bitch', 'retard'
    ],
    // 違法・薬物・勧誘
    illegal: [
      'たいま', 'まやく', 'かくせいざい', 'こかいん', 'へろいん', 'やくぶつ',
      'やみばいと', 'うらばいと', 'やみきん', 'けんじゅう', 'であるい',
      'であいけい', 'むほうみっちゃく',
      '大麻', '覚醒剤', '麻薬', '薬物', '闇バイト', '裏バイト', '闇金',
      'drug', 'cocaine'
    ]
  };

  /** 全カテゴリを平坦化した語彙（正規化済み） */
  const WORDS = Object.keys(CATEGORIES).reduce(function (all, key) {
    return all.concat(CATEGORIES[key]);
  }, []);

  /** カタカナ（ァ-ヶ）をひらがなへ寄せる */
  function toHiragana(str) {
    return str.replace(/[\u30a1-\u30f6]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
  }

  /**
   * 判定用の正規化。
   * 「英数字・ひらがな・漢字」以外はすべて落とすので、記号挟みも長音も無効化される。
   * @param {string} input
   * @returns {string}
   */
  function normalize(input) {
    if (input === null || input === undefined) return '';
    let s = String(input);
    if (typeof s.normalize === 'function') {
      s = s.normalize('NFKC');
    }
    s = s.toLowerCase();
    s = toHiragana(s);
    s = s.replace(/[^0-9a-z\u3041-\u3096\u4e00-\u9fff]/g, '');
    return s;
  }

  /** 正規化済みの語彙（SQL 生成・テスト用） */
  const NORMALIZED_WORDS = WORDS.map(normalize);

  /**
   * NGワードが含まれているか（表記ゆれ吸収済み）
   * @param {string} input
   * @returns {boolean}
   */
  function hasSensitiveWord(input) {
    const normalized = normalize(input);
    if (!normalized) return false;
    return NORMALIZED_WORDS.some(function (word) {
      return word.length > 0 && normalized.indexOf(word) !== -1;
    });
  }

  /**
   * URL・メール・電話番号らしき文字列か。
   * 15文字の投稿に必要な場面がないため、見つけたら投稿を止める。
   * @param {string} input
   * @returns {boolean}
   */
  function hasLink(input) {
    if (!input) return false;
    const raw = String(input).normalize ? String(input).normalize('NFKC') : String(input);
    if (/https?:\/\//i.test(raw)) return true;
    if (/www\./i.test(raw)) return true;
    if (/[a-z0-9-]+\.(com|net|org|jp|io|me|ly|app|co)\b/i.test(raw)) return true;
    if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw)) return true;
    // 電話番号（ハイフンあり／なしの10〜11桁）
    if (/\d{10,11}/.test(normalizeKeepDigits(input))) return true;
    return false;
  }

  /** 数字だけを残す（電話番号判定用。「3時に10分」等の誤爆を避けるため10桁以上のみ） */
  function normalizeKeepDigits(input) {
    if (!input) return '';
    return String(input).replace(/[^0-9]/g, '');
  }

  /**
   * 投稿テキストとして拒否すべきか。
   * @param {string} input
   * @returns {{blocked: boolean, reason: string}}
   */
  function inspect(input) {
    if (hasSensitiveWord(input)) return { blocked: true, reason: 'sensitive' };
    if (hasLink(input)) return { blocked: true, reason: 'link' };
    return { blocked: false, reason: '' };
  }

  return {
    CATEGORIES: CATEGORIES,
    WORDS: WORDS,
    NORMALIZED_WORDS: NORMALIZED_WORDS,
    normalize: normalize,
    hasSensitiveWord: hasSensitiveWord,
    hasLink: hasLink,
    inspect: inspect
  };
});
