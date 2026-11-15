/**
 * DATE-15 - tabs.js
 * iPhoneアプリ（Capacitor ネイティブ）だけの3タブ表示と、起動時のルール説明。
 *
 * 【Webブラウザ】window.Capacitor.isNativePlatform() が false なら何もしない。
 *   1ページ縦長の今の表示のまま（HTML/CSS は html[data-date15-tabs="true"] で
 *   スコープしてあるので、この属性が付かない Web 版は一切変わらない）。
 *
 * 【iPhoneアプリ】起動時に <html data-date15-tabs="true"> を立てて、
 *   ・メインの3セクションをタブ（🎲 ルーレット／💌 投稿する／🏆 一覧）で切り替える
 *     切り替え時はスクロール位置を先頭へ戻す。
 *   ・下部タブバーは AdMob バナーの上に固定（bottom = バナー高さ + 下セーフエリア）。
 *     バナー高さは admob.js が --admob-banner-height に入れた実測値を
 *     CSS の --date15-banner-offset 経由で共有する（本文の下余白も同じ値）。
 *   ・初回起動時だけルール説明を自動表示。閉じたら localStorage に既読を覚え、
 *     次回以降は邪魔しない。ヘッダーの「？」からはいつでも開ける。
 *
 * 依存なし・単体でも読み込めるように、DOM は引数で差し替えられる形にしてある。
 */

(function (global) {
  'use strict';

  /** ルール説明を読んだかどうかの保存キー */
  const RULES_SEEN_KEY = 'date15_rules_seen';

  /** タブの並び（HTML の data-date15-tab / data-date15-panel と一致させる） */
  const TAB_IDS = ['roulette', 'post', 'list'];

  /** 下部タブバーの高さ（index.html の --date15-tabbar-height と一致させる） */
  const DEFAULT_TABBAR_HEIGHT = 58;

  /** いま選ばれているタブ（テスト・デバッグ用に参照できる） */
  let currentTab = null;

  /** ルール説明を閉じたときに一度だけ呼ぶコールバック */
  let onRulesClosedCallbacks = [];

  function resolveWindow(win) {
    return win || (typeof global !== 'undefined' ? global : null);
  }

  function resolveDocument(win) {
    const w = resolveWindow(win);
    return (w && w.document) || null;
  }

  /**
   * Capacitor のネイティブ実行かどうか。
   * Web ブラウザ・単体テスト（Capacitor なし）はすべて false。
   * @returns {boolean}
   */
  function isNativePlatform(win) {
    const w = resolveWindow(win);
    try {
      return !!(w && w.Capacitor
        && typeof w.Capacitor.isNativePlatform === 'function'
        && !!w.Capacitor.isNativePlatform());
    } catch (err) {
      return false;
    }
  }

  /** localStorage を安全に取る（プライベートモード等で例外が出ても止めない） */
  function getStorage(win) {
    const w = resolveWindow(win);
    try {
      return (w && w.localStorage) || null;
    } catch (err) {
      return null;
    }
  }

  /** ルール説明を一度でも読んだか */
  function hasSeenRules(win) {
    const storage = getStorage(win);
    try {
      return !!(storage && storage.getItem(RULES_SEEN_KEY) === '1');
    } catch (err) {
      return false;
    }
  }

  /** 既読を記録する */
  function markRulesSeen(win) {
    const storage = getStorage(win);
    try {
      if (storage) storage.setItem(RULES_SEEN_KEY, '1');
    } catch (err) {
      /* 保存できなくても表示自体は続けられるので無視する */
    }
  }

  /** タブ表示モードか（<html data-date15-tabs="true">） */
  function isTabMode(win) {
    const doc = resolveDocument(win);
    if (!doc || !doc.documentElement) return false;
    return doc.documentElement.getAttribute('data-date15-tabs') === 'true';
  }

  function panelFor(doc, id) {
    return doc.querySelector(`[data-date15-panel="${id}"]`);
  }

  function tabButtonFor(doc, id) {
    return doc.querySelector(`[data-date15-tab="${id}"]`);
  }

  /**
   * タブを切り替える。選んだセクションだけを表示し、スクロールを先頭へ戻す。
   * @param {string} id 'roulette' | 'post' | 'list'
   * @param {{ window?: object, document?: object, scroll?: boolean }} [options]
   * @returns {boolean} 切り替えられたか
   */
  function setTab(id, options) {
    const opts = options || {};
    const win = resolveWindow(opts.window);
    const doc = opts.document || resolveDocument(win);
    if (!doc || TAB_IDS.indexOf(id) === -1) return false;

    TAB_IDS.forEach((tabId) => {
      const panel = panelFor(doc, tabId);
      if (panel) {
        if (tabId === id) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
      }
      const button = tabButtonFor(doc, tabId);
      if (button) button.setAttribute('aria-selected', tabId === id ? 'true' : 'false');
    });

    currentTab = id;

    // タブを変えたら前のタブのスクロール位置を引き継がない（先頭から読ませる）
    if (opts.scroll !== false && win && typeof win.scrollTo === 'function') {
      try {
        win.scrollTo(0, 0);
      } catch (err) {
        /* スクロールできない環境でも切り替え自体は成立させる */
      }
    }
    return true;
  }

  /** いま選ばれているタブ */
  function getCurrentTab() {
    return currentTab;
  }

  /**
   * ルール説明を開く。
   * @returns {boolean} 開けたか（要素が無ければ false）
   */
  function openRules(options) {
    const opts = options || {};
    const win = resolveWindow(opts.window);
    const doc = opts.document || resolveDocument(win);
    const overlay = doc && doc.getElementById('date15RulesOverlay');
    if (!overlay) return false;

    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    // 背景の本文が一緒にスクロールしないようにする
    if (doc.body && doc.body.style) doc.body.style.overflow = 'hidden';
    return true;
  }

  /**
   * ルール説明を閉じる。閉じた時点で「既読」を記録する（次回から自動表示しない）。
   * @returns {boolean}
   */
  function closeRules(options) {
    const opts = options || {};
    const win = resolveWindow(opts.window);
    const doc = opts.document || resolveDocument(win);
    const overlay = doc && doc.getElementById('date15RulesOverlay');
    if (!overlay) return false;

    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (doc.body && doc.body.style) doc.body.style.overflow = '';
    markRulesSeen(win);

    const callbacks = onRulesClosedCallbacks;
    onRulesClosedCallbacks = [];
    callbacks.forEach((callback) => {
      try {
        callback();
      } catch (err) {
        console.warn('[Tabs] ルール説明を閉じたあとの処理で失敗しました:', err);
      }
    });
    return true;
  }

  /**
   * タブバー・ルール説明を配線する。ネイティブでなければ何もしない。
   * @param {{ window?: object, document?: object, forceNative?: boolean, onRulesClosed?: Function }} [options]
   * @returns {{ native: boolean, tabMode: boolean, autoShown: boolean }}
   */
  function init(options) {
    const opts = options || {};
    const win = resolveWindow(opts.window);
    const doc = opts.document || resolveDocument(win);
    const skipped = { native: false, tabMode: false, autoShown: false };
    if (!doc || !doc.documentElement) return skipped;

    const native = typeof opts.forceNative === 'boolean' ? opts.forceNative : isNativePlatform(win);
    if (!native) return skipped;

    doc.documentElement.setAttribute('data-date15-tabs', 'true');

    if (typeof opts.onRulesClosed === 'function') {
      onRulesClosedCallbacks.push(opts.onRulesClosed);
    }

    // タブの切り替え
    TAB_IDS.forEach((id) => {
      const button = tabButtonFor(doc, id);
      if (!button) return;
      button.addEventListener('click', () => setTab(id, { window: win, document: doc }));
    });

    // ヘッダーの「？」（表示は CSS 側でネイティブのタブ表示時だけ）
    const openButton = doc.getElementById('btnOpenRules');
    if (openButton) {
      openButton.addEventListener('click', () => openRules({ window: win, document: doc }));
    }

    // 閉じる（「はじめる」・「✕」・背景タップ・Escape）
    ['btnCloseRules', 'btnCloseRulesX'].forEach((id) => {
      const element = doc.getElementById(id);
      if (element) element.addEventListener('click', () => closeRules({ window: win, document: doc }));
    });

    const overlay = doc.getElementById('date15RulesOverlay');
    if (overlay) {
      overlay.addEventListener('click', (event) => {
        if (event && event.target === overlay) closeRules({ window: win, document: doc });
      });
    }

    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('keydown', (event) => {
        if (event && event.key === 'Escape' && overlay && overlay.classList.contains('is-open')) {
          closeRules({ window: win, document: doc });
        }
      });
    }

    // 最初はルーレットのタブ
    setTab('roulette', { window: win, document: doc, scroll: false });

    // 初回起動だけルール説明を出す（既読なら出さない）
    const autoShown = !hasSeenRules(win) && openRules({ window: win, document: doc });

    return { native: true, tabMode: true, autoShown };
  }

  const api = {
    RULES_SEEN_KEY,
    TAB_IDS,
    DEFAULT_TABBAR_HEIGHT,
    isNativePlatform,
    isTabMode,
    hasSeenRules,
    markRulesSeen,
    init,
    showTab: setTab,
    getCurrentTab,
    openRules,
    closeRules
  };

  if (typeof global !== 'undefined' && global) {
    global.Date15Tabs = api;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
