/**
 * DATE-15 - guard.js
 * 連投制限・端末ID・通報の共通処理（ブラウザ／単体テスト共通）
 *
 * 【なぜ端末IDか】
 *   アカウント登録のないアプリなので、サーバー側で「同一人物の連投」を見分けるには
 *   端末ごとのIDが要る。localStorage のIDは消せば作り直せるが、
 *   それでも「何も持たない状態からの連投」よりは抑えられ、
 *   サーバー側（device_id + 60秒）と併用することで実効性が出る。
 *
 * 【連投制限】
 *   投稿は60秒に1回まで。投稿に成功した時点で時刻を記録する。
 *   残り秒数は UI にそのまま出す（「あと何秒」が分かる方が待ちやすい）。
 *
 * 【通報】
 *   通報は Supabase の date_plan_reports に1件ずつ記録する。
 *   同じ端末から同じプランへの多重通報は端末側で抑止する（1プラン1回）。
 */

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.Date15Guard = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** 投稿の最小間隔（ミリ秒）。サーバー側トリガーと同じ60秒。 */
  const POST_COOLDOWN_MS = 60 * 1000;

  const KEY_DEVICE_ID = 'date15_device_id';
  const KEY_LAST_POST = 'date15_last_post_at';
  const KEY_REPORTED = 'date15_reported_plans';

  /** localStorage が使えない環境（プライベートモード等）でも落ちない薄いラッパ */
  function safeGet(storage, key) {
    try {
      return storage ? storage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }

  function safeSet(storage, key, value) {
    try {
      if (storage) storage.setItem(key, String(value));
    } catch (e) {}
  }

  /** 端末IDを作る（無ければ保存して使い回す） */
  function getDeviceId(storage, cryptoObj) {
    const saved = safeGet(storage, KEY_DEVICE_ID);
    if (saved) return saved;

    let id = '';
    const c = cryptoObj || (typeof crypto !== 'undefined' ? crypto : null);
    if (c && typeof c.randomUUID === 'function') {
      id = c.randomUUID();
    } else if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      id = Array.prototype.map.call(bytes, function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    } else {
      // 最終フォールバック（暗号強度は不要。端末の区別ができればよい）
      id = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }
    safeSet(storage, KEY_DEVICE_ID, id);
    return id;
  }

  /**
   * いま投稿できるか。
   * @param {Storage|null} storage
   * @param {number} now
   * @returns {{allowed: boolean, remainingMs: number, remainingSec: number}}
   */
  function checkPostCooldown(storage, now) {
    const current = typeof now === 'number' ? now : Date.now();
    const last = Number(safeGet(storage, KEY_LAST_POST));
    if (!last || !isFinite(last) || last <= 0) {
      return { allowed: true, remainingMs: 0, remainingSec: 0 };
    }
    const elapsed = current - last;
    if (elapsed >= POST_COOLDOWN_MS) {
      return { allowed: true, remainingMs: 0, remainingSec: 0 };
    }
    const remainingMs = POST_COOLDOWN_MS - elapsed;
    return {
      allowed: false,
      remainingMs: remainingMs,
      remainingSec: Math.ceil(remainingMs / 1000)
    };
  }

  /** 投稿が通った時刻を記録する */
  function markPosted(storage, now) {
    const current = typeof now === 'number' ? now : Date.now();
    safeSet(storage, KEY_LAST_POST, current);
  }

  /** 通報済みプランIDの一覧 */
  function getReportedIds(storage) {
    const raw = safeGet(storage, KEY_REPORTED);
    if (!raw) return [];
    try {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.map(String) : [];
    } catch (e) {
      return [];
    }
  }

  /** この端末からこのプランを既に通報したか */
  function hasReported(storage, planId) {
    return getReportedIds(storage).indexOf(String(planId)) !== -1;
  }

  /** 通報済みとして記録する */
  function markReported(storage, planId) {
    const list = getReportedIds(storage);
    const id = String(planId);
    if (list.indexOf(id) === -1) list.push(id);
    // 無限に増えないよう直近200件だけ保持する
    safeSet(storage, KEY_REPORTED, JSON.stringify(list.slice(-200)));
  }

  /**
   * 通報の送信内容（Supabase date_plan_reports への INSERT 用）
   * @param {{planId: number|string, reason?: string, deviceId?: string}} input
   */
  function buildReportPayload(input) {
    return {
      plan_id: input.planId,
      reason: input.reason || 'inappropriate',
      device_id: input.deviceId || null
    };
  }

  return {
    POST_COOLDOWN_MS: POST_COOLDOWN_MS,
    KEY_DEVICE_ID: KEY_DEVICE_ID,
    KEY_LAST_POST: KEY_LAST_POST,
    KEY_REPORTED: KEY_REPORTED,
    getDeviceId: getDeviceId,
    checkPostCooldown: checkPostCooldown,
    markPosted: markPosted,
    getReportedIds: getReportedIds,
    hasReported: hasReported,
    markReported: markReported,
    buildReportPayload: buildReportPayload
  };
});
