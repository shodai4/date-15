/**
 * 理想のデートプランを15文字でどうぞ。 - アプリスクリプト (改修版)
 */

(() => {
  'use strict';

  // ==========================================
  // 1. 初期プリセット10選（初期値: 匿名希望、いいね数: 1）
  // ==========================================
  const INITIAL_PLANS = [
    { id: 1, text: '散歩中の可愛い犬を数えて歩こう', author: '匿名希望', likes: 1, createdAt: 1731248000000 },
    { id: 2, text: '古本屋で五百円分選び合ってみる', author: '匿名希望', likes: 1, createdAt: 1731248100000 },
    { id: 3, text: '昔ながらの駄菓子屋で三百円豪遊', author: '匿名希望', likes: 1, createdAt: 1731248200000 },
    { id: 4, text: 'レンタルビデオでジャケ買い勝負', author: '匿名希望', likes: 1, createdAt: 1731248300000 },
    { id: 5, text: 'ガチャガチャを二人でフルコンプ', author: '匿名希望', likes: 1, createdAt: 1731248400000 },
    { id: 6, text: '深夜のドライブで静かな海を見に', author: '匿名希望', likes: 1, createdAt: 1731248500000 },
    { id: 7, text: 'デパ地下試食コーナー全種類制覇', author: '匿名希望', likes: 1, createdAt: 1731248600000 },
    { id: 8, text: 'ボードゲームカフェで真剣勝負す', author: '匿名希望', likes: 1, createdAt: 1731248700000 },
    { id: 9, text: '見知らぬ駅でふらり途中下車する', author: '匿名希望', likes: 1, createdAt: 1731248800000 },
    { id: 10, text: '早朝の市場で熱い朝ラーメン食う', author: '匿名希望', likes: 1, createdAt: 1731248900000 }
  ];

  // ==========================================
  // 2. 状態管理 (State)
  // ==========================================
  const state = {
    plans: [],
    currentSort: 'likes', // 'likes' | 'newest' | 'random'
    votedIds: new Set(),
    isSpinning: false,
    selectedPlan: null,
    isOnlineDB: false
  };

  const STORAGE_KEY_PLANS = 'date15_custom_plans';
  const STORAGE_KEY_VOTES = 'date15_voted_ids';
  const STORAGE_KEY_AUTHOR = 'date15_last_author';

  // ==========================================
  // 2.5 投稿ガード（NGワード・URL・連投制限・通報）
  // ==========================================
  // 判定ロジックは ng-check.js / guard.js に集約し、単体テストと
  // Supabase の DBトリガー（supabase/migrations/）と語彙を揃えている。
  // 万一モジュールが読めなかった場合は「判定不能＝投稿させない」側に倒す。
  const NG = window.Date15NG;
  const Guard = window.Date15Guard;

  function checkSensitiveWord(str) {
    if (!NG || typeof NG.hasSensitiveWord !== 'function') return true;
    return NG.hasSensitiveWord(str) || NG.hasLink(str);
  }

  /** NGの理由を1行で返す（記号挟み等で何が引っかかったかは言わない） */
  function ngReasonLabel(str) {
    if (NG && NG.hasSensitiveWord(str)) return '不適切な表現が含まれています';
    if (NG && NG.hasLink(str)) return 'リンクや連絡先は投稿できません';
    return '投稿できない文字列が含まれています';
  }

  function hasWhitespace(str) {
    return /[\s\u3000]/.test(str);
  }

  function countChars(str) {
    return [...str].length;
  }

  // ==========================================
  // 3. データ読込 & Supabase連携
  // ==========================================
  async function loadData() {
    try {
      const savedVotes = localStorage.getItem(STORAGE_KEY_VOTES);
      if (savedVotes) {
        state.votedIds = new Set(JSON.parse(savedVotes));
      }
    } catch (e) {}

    try {
      const lastAuthor = localStorage.getItem(STORAGE_KEY_AUTHOR);
      const authorInput = document.getElementById('authorInput');
      if (lastAuthor && authorInput) {
        authorInput.value = lastAuthor;
      }
    } catch (e) {}

    const cfg = window.DATE_CONFIG || {};
    if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      try {
        const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/${cfg.TABLE_NAME}?select=*&order=likes.desc`, {
          headers: {
            'apikey': cfg.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${cfg.SUPABASE_ANON_KEY}`
          }
        });
        if (res.ok) {
          const remoteData = await res.json();
          if (Array.isArray(remoteData) && remoteData.length > 0) {
            state.plans = remoteData.map(r => ({
              id: r.id,
              text: r.text,
              author: r.author || '匿名希望',
              likes: r.likes !== undefined ? r.likes : 1,
              hidden: r.hidden === true,
              createdAt: new Date(r.created_at).getTime()
            }));
            state.isOnlineDB = true;
            renderPlans();
            updateRouletteCount();
            return;
          }
        }
      } catch (err) {
        console.warn('Supabase fetch failed, falling back to local storage:', err);
      }
    }

    try {
      const customPlans = localStorage.getItem(STORAGE_KEY_PLANS);
      const userList = customPlans ? JSON.parse(customPlans) : [];
      state.plans = [...INITIAL_PLANS, ...userList];
    } catch (e) {
      state.plans = [...INITIAL_PLANS];
    }

    renderPlans();
    updateRouletteCount();
  }

  function saveLocalVotes() {
    try {
      localStorage.setItem(STORAGE_KEY_VOTES, JSON.stringify(Array.from(state.votedIds)));
    } catch (e) {}
  }

  function saveLocalPlans(newPlan) {
    try {
      const customPlans = localStorage.getItem(STORAGE_KEY_PLANS);
      const list = customPlans ? JSON.parse(customPlans) : [];
      list.push(newPlan);
      localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(list));
    } catch (e) {}
  }

  /**
   * Supabase への投稿。
   * 戻り値: 'ok' | 'rejected'（サーバー側トリガーが NG/連投 で弾いた）| 'failed'（通信・スキーマ）
   * マイグレーション適用前の環境（device_id 列がない）でも投稿できるよう、
   * 列不足のエラーだけは device_id を外して1回だけやり直す。
   */
  async function postPlanToSupabase(cfg, payload) {
    const url = `${cfg.SUPABASE_URL}/rest/v1/${cfg.TABLE_NAME}`;
    const send = async (body) => fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${cfg.SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(body)
    });

    try {
      let res = await send(payload);
      if (res.ok) return 'ok';

      let errText = '';
      try { errText = await res.text(); } catch (e) {}

      // サーバー側の NG / 連投トリガーで拒否された
      if (/date15_(ng|link|rate|length|author)/i.test(errText)) return 'rejected';

      // device_id 列が未作成（マイグレーション前）なら、その列なしでやり直す
      if (/device_id/i.test(errText)) {
        const fallback = Object.assign({}, payload);
        delete fallback.device_id;
        res = await send(fallback);
        if (res.ok) return 'ok';
        try { errText = await res.text(); } catch (e) {}
        if (/date15_(ng|link|rate|length|author)/i.test(errText)) return 'rejected';
      }

      console.warn('Supabase post rejected:', res.status, errText);
      return 'failed';
    } catch (e) {
      console.warn('Supabase post failed:', e);
      return 'failed';
    }
  }

  /** 画面とルーレットに出すプラン（非表示・通報で隠したものを除く） */
  function visiblePlans() {
    return state.plans.filter(p => !p.hidden && !p.hiddenByReport);
  }

  // ==========================================
  // 4. 15文字原稿用紙グリッド (コンパクト版)  // ==========================================
  function initCharGrid() {
    const grid = document.getElementById('charGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 15; i++) {
      const cell = document.createElement('div');
      cell.className = 'char-cell';
      cell.id = `cell-${i}`;
      grid.appendChild(cell);
    }
  }

  function updateCharGrid(text) {
    const chars = [...text];
    const len = chars.length;

    const countBadge = document.getElementById('charCountBadge');
    const countEl = document.getElementById('currentCharCount');
    const msgEl = document.getElementById('statusMessage');
    const submitBtn = document.getElementById('btnSubmitPlan');
    const clearBtn = document.getElementById('btnClearInput');

    if (countEl) countEl.textContent = len;
    if (clearBtn) clearBtn.classList.toggle('hidden', len === 0);

    for (let i = 0; i < 15; i++) {
      const cell = document.getElementById(`cell-${i}`);
      if (!cell) continue;

      if (i < len) {
        cell.textContent = chars[i];
        cell.className = `char-cell filled ${len === 15 ? 'perfect' : ''}`;
      } else {
        cell.textContent = '';
        cell.className = 'char-cell';
      }
    }

    if (hasWhitespace(text)) {
      countBadge.className = 'shrink-0 whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-200 border border-rose-700';
      msgEl.textContent = '⚠️ 空白（スペース）は使えません';
      msgEl.className = 'text-[11px] font-bold text-rose-500 whitespace-nowrap transition-all';
      submitBtn.disabled = true;
      submitBtn.className = 'w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-[#B8A499] cursor-not-allowed transition flex items-center justify-center space-x-1.5 shadow-xs';
      return;
    }

    if (checkSensitiveWord(text)) {
      countBadge.className = 'shrink-0 whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-200 border border-rose-700';
      msgEl.textContent = `⚠️ ${ngReasonLabel(text)}`;
      msgEl.className = 'text-[11px] font-bold text-rose-500 whitespace-nowrap transition-all';
      submitBtn.disabled = true;
      submitBtn.className = 'w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-[#B8A499] cursor-not-allowed transition flex items-center justify-center space-x-1.5 shadow-xs';
      return;
    }

    if (len === 15) {
      countBadge.className = 'shrink-0 whitespace-nowrap text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300 animate-pulse';
      msgEl.textContent = '✨ 15文字ピッタリ！このまま投稿できます！';
      msgEl.className = 'text-xs font-bold text-rose-600 whitespace-nowrap transition-all';
      submitBtn.disabled = false;
      submitBtn.className = 'w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#E26D6D] to-[#D65D5D] hover:opacity-95 active:scale-[0.99] shadow-lg shadow-rose-300/50 transition flex items-center justify-center space-x-1.5 cursor-pointer';
    } else if (len > 15) {
      const over = len - 15;
      countBadge.className = 'shrink-0 whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-200 border border-rose-700';
      msgEl.textContent = `⚠️ ${over}文字オーバーです（15文字丁度に削ってね）`;
      msgEl.className = 'text-[11px] font-bold text-rose-500 whitespace-nowrap transition-all';
      submitBtn.disabled = true;
      submitBtn.className = 'w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-[#B8A499] cursor-not-allowed transition flex items-center justify-center space-x-1.5 shadow-xs';
    } else {
      const remain = 15 - len;
      countBadge.className = 'shrink-0 whitespace-nowrap text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FAF5F2] text-[#6E564B] border border-[#B8A499]';
      msgEl.textContent = len === 0 ? 'ピッタリ15文字になると投稿できます' : `あと ${remain} 文字でピッタリです`;
      msgEl.className = 'text-[11px] text-[#7C6656] whitespace-nowrap transition-all';
      submitBtn.disabled = true;
      submitBtn.className = 'w-full py-2.5 px-4 rounded-xl font-bold text-sm text-white bg-[#B8A499] cursor-not-allowed transition flex items-center justify-center space-x-1.5 shadow-xs';
    }
  }

  // ==========================================
  // 5. 投稿処理
  // ==========================================
  async function submitPlan() {
    const input = document.getElementById('planInput');
    const authorInput = document.getElementById('authorInput');
    if (!input) return;

    const rawText = input.value.trim();

    if (hasWhitespace(input.value)) {
      alert('空白（スペース）は使用できません。');
      return;
    }

    if (checkSensitiveWord(rawText)) {
      alert(`投稿できません。${ngReasonLabel(rawText)}。`);
      return;
    }

    if (countChars(rawText) !== 15) {
      alert('ピッタリ15文字で入力してください。');
      return;
    }

    // 連投制限（同一端末で60秒に1回）。サーバー側トリガーと同じ間隔。
    const cooldown = Guard
      ? Guard.checkPostCooldown(localStorage)
      : { allowed: true, remainingSec: 0 };
    if (!cooldown.allowed) {
      alert(`連投を防ぐため、あと${cooldown.remainingSec}秒お待ちください。`);
      return;
    }

    const author = (authorInput && authorInput.value.trim()) ? authorInput.value.trim() : '匿名希望';
    if (checkSensitiveWord(author)) {
      alert('ニックネームに不適切な表現が含まれています。');
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY_AUTHOR, author);
    } catch (e) {}

    const cfg = window.DATE_CONFIG || {};
    const newId = Date.now();
    const newPlan = {
      id: newId,
      text: rawText,
      author: author,
      likes: 1,
      createdAt: Date.now()
    };
    const deviceId = Guard ? Guard.getDeviceId(localStorage) : null;

    if (state.isOnlineDB && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      const result = await postPlanToSupabase(cfg, {
        text: rawText,
        author: author,
        likes: 1,
        device_id: deviceId
      });
      if (result === 'rejected') {
        alert('投稿できませんでした。不適切な表現、または連投の可能性があります。');
        return;
      }
    } else {
      saveLocalPlans(newPlan);
    }

    if (Guard) Guard.markPosted(localStorage);

    state.plans.unshift(newPlan);
    state.votedIds.add(newPlan.id);
    saveLocalVotes();

    if (typeof confetti === 'function') {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    }

    input.value = '';
    updateCharGrid('');
    renderPlans();
    updateRouletteCount();

    alert('素敵なデートプランを投稿しました！💕');

    // iPhoneアプリのタブ表示では、投稿したプランをそのまま見られるよう「一覧」へ移る
    const tabsApi = window.Date15Tabs;
    if (tabsApi && typeof tabsApi.isTabMode === 'function' && tabsApi.isTabMode()
      && typeof tabsApi.showTab === 'function') {
      tabsApi.showTab('list');
    }
  }

  // ==========================================
  // 6. いいね (Like) 処理
  // ==========================================
  async function toggleLike(planId) {
    const plan = state.plans.find(p => p.id === planId);
    if (!plan) return;

    const hasVoted = state.votedIds.has(planId);
    const delta = hasVoted ? -1 : 1;

    plan.likes = Math.max(0, plan.likes + delta);

    if (hasVoted) {
      state.votedIds.delete(planId);
    } else {
      state.votedIds.add(planId);
    }
    saveLocalVotes();

    const cfg = window.DATE_CONFIG || {};
    if (state.isOnlineDB && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      try {
        await fetch(`${cfg.SUPABASE_URL}/rest/v1/${cfg.TABLE_NAME}?id=eq.${planId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': cfg.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${cfg.SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ likes: plan.likes })
        });
      } catch (e) {}
    }

    renderPlans();
    updateRouletteLikeBtn();
  }
  function updateRouletteLikeBtn() {
    const likeBtn = document.getElementById('btnLikeRoulette');
    const heartEl = document.getElementById('rouletteLikeHeart');
    const countEl = document.getElementById('rouletteLikeCount');
    if (!likeBtn || !state.selectedPlan) return;

    const isVoted = state.votedIds.has(state.selectedPlan.id);
    if (heartEl) {
      heartEl.textContent = isVoted ? '❤️' : '🤍';
      heartEl.className = isVoted ? 'heart-bounce' : '';
    }
    if (countEl) {
      countEl.textContent = state.selectedPlan.likes || 0;
    }
    if (isVoted) {
      likeBtn.className = 'bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-600 font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center space-x-1 transition active:scale-95 shadow-xs whitespace-nowrap';
    } else {
      likeBtn.className = 'bg-[#FAF5F2] hover:bg-[#EFE5DF] border border-[#B8A499] text-[#6E564B] font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center space-x-1 transition active:scale-95 whitespace-nowrap';
    }
  }


  // ==========================================
  // 6.5 通報（モデレーション）
  // ==========================================
  // 通報は date_plan_reports に1件ずつ記録する。同じ端末から同じプランへは1回だけ。
  // 通報したプランは自分の一覧からも即座に消す（不快なものを二度見せない）。
  // 3件たまったらサーバー側トリガーが自動で hidden=true にする。
  async function reportPlan(planId) {
    const plan = state.plans.find(p => String(p.id) === String(planId));
    if (!plan) return false;

    if (Guard && Guard.hasReported(localStorage, planId)) {
      plan.hiddenByReport = true;
      renderPlans();
      updateRouletteCount();
      alert('このプランはすでに通報済みです。');
      return false;
    }

    if (typeof window.confirm === 'function'
      && !window.confirm('このプランを不適切な投稿として運営に通報しますか？\n（あなたの一覧からはすぐに非表示になります）')) {
      return false;
    }

    const cfg = window.DATE_CONFIG || {};
    let sent = false;
    if (state.isOnlineDB && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      const deviceId = Guard ? Guard.getDeviceId(localStorage) : null;
      try {
        const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/${cfg.REPORT_TABLE_NAME || 'date_plan_reports'}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': cfg.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${cfg.SUPABASE_ANON_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(Guard
            ? Guard.buildReportPayload({ planId: planId, deviceId: deviceId })
            : { plan_id: planId, reason: 'inappropriate' })
        });
        sent = res.ok;
      } catch (e) {
        console.warn('Supabase report failed:', e);
      }
    }

    if (sent && Guard) Guard.markReported(localStorage, planId);
    plan.hiddenByReport = true;
    renderPlans();
    updateRouletteCount();
    alert(sent
      ? '通報を受け付けました。運営が確認します。'
      : '通報の送信に失敗しました。通信環境を確認してもう一度お試しください。');
    return sent;
  }


  // ==========================================
  // 7. 運命のルーレット機能
  // ==========================================
  function spinRoulette() {
    const pool = visiblePlans();
    if (state.isSpinning || pool.length === 0) return;
    state.isSpinning = true;

    const resultEl = document.getElementById('rouletteResult');
    const authorEl = document.getElementById('rouletteAuthor');
    const spinBtn = document.getElementById('btnSpinRoulette');
    const shareBtn = document.getElementById('btnShareRoulette');
    const likeBtn = document.getElementById('btnLikeRoulette');

    resultEl.classList.add('slot-rolling', 'text-rose-500');
    spinBtn.disabled = true;
    if (authorEl) authorEl.classList.add('hidden');
    if (shareBtn) shareBtn.classList.add('hidden');
    if (likeBtn) likeBtn.classList.add('hidden');

    let rollCount = 0;
    const maxRolls = 20;
    const interval = 80;

    const timer = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * pool.length);
      resultEl.textContent = `「${pool[randomIndex].text}」`;
      rollCount++;

      if (rollCount >= maxRolls) {
        clearInterval(timer);
        const finalPlan = pool[Math.floor(Math.random() * pool.length)];
        state.selectedPlan = finalPlan;

        resultEl.classList.remove('slot-rolling', 'text-rose-500');
        resultEl.textContent = `「${finalPlan.text}」`;
        if (authorEl) {
          authorEl.textContent = `by ${finalPlan.author || '匿名希望'}`;
          authorEl.classList.remove('hidden');
        }
        if (shareBtn) shareBtn.classList.remove('hidden');
        updateRouletteLikeBtn();
        if (likeBtn) likeBtn.classList.remove('hidden');
        spinBtn.disabled = false;
        spinBtn.innerHTML = '<span>もう一度決める</span>';
        state.isSpinning = false;
      }
    }, interval);
  }

  function shareResultToX() {
    if (!state.selectedPlan) return;
    const authorText = ` (by ${state.selectedPlan.author || '匿名希望'})`;
    const text = `今日のふたりのデートは【${state.selectedPlan.text}】${authorText}に決まりました！💖✨\n\nたった15文字で綴る、愛おしいデート。\n#理想のデート15文字 #デートプラン\n`;
    const url = window.location.href;
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(xUrl, '_blank');
  }

  function updateRouletteCount() {
    const el = document.getElementById('rouletteTotalCount');
    if (el) el.textContent = visiblePlans().length;
  }

  // ==========================================
  // 8. プラン一覧レンダリング & ソート
  // ==========================================
  function renderPlans() {
    const container = document.getElementById('plansContainer');
    if (!container) return;

    let sorted = [...visiblePlans()];
    if (state.currentSort === 'likes') {
      sorted.sort((a, b) => b.likes - a.likes);
    } else if (state.currentSort === 'newest') {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    } else if (state.currentSort === 'random') {
      sorted.sort(() => Math.random() - 0.5);
    }

    if (sorted.length === 0) {
      container.innerHTML = '<div class="text-center py-6 text-sm text-[#7C6656]">まだ投稿がありません。最初の15文字を投稿してみよう！</div>';
      return;
    }

    container.innerHTML = sorted.map((plan, index) => {
      const isVoted = state.votedIds.has(plan.id);
      const isTop3 = state.currentSort === 'likes' && index < 3;
      const rankBadge = isTop3 
        ? `<span class="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${index === 0 ? 'bg-amber-400 text-amber-950' : index === 1 ? 'bg-slate-300 text-slate-800' : 'bg-amber-600 text-amber-50'}">${index + 1}</span>`
        : `<span class="w-6 h-6 shrink-0 flex items-center justify-center text-[11px] text-[#7C6656] font-bold">${index + 1}</span>`;

      return `
        <div class="plan-card bg-[#FFFDFB] rounded-2xl px-4 py-3.5 border border-[#E6DAD0] shadow-[0_1px_2px_rgba(90,70,58,0.06)] flex items-center justify-between gap-3 hover:border-[#CDB9A9] transition">
          <div class="flex items-center space-x-2 flex-1 min-w-0">
            ${rankBadge}
            <div class="min-w-0 flex-1">
              <div class="plan-text text-[15px] sm:text-base font-bold font-mincho text-[#2D231E] tracking-tight leading-relaxed">
                ${plan.text}
              </div>
              <div class="text-[11px] text-[#6E564B] flex items-center space-x-1 mt-1 whitespace-nowrap">
                <span>by <span class="truncate">${plan.author || '匿名希望'}</span></span>
              </div>
            </div>
          </div>

          <div class="shrink-0 flex items-center gap-1">
            <!-- いいねボタン -->
            <button
              onclick="window.toggleLikeHandler(${plan.id})"
              aria-label="いいね"
              class="flex items-center space-x-1 px-3 py-1.5 rounded-full border transition active:scale-95 text-xs font-bold ${
                isVoted
                  ? 'bg-rose-50 border-rose-300 text-rose-600 shadow-xs'
                  : 'bg-[#FAF5F2] border-[#E6DAD0] text-[#6E564B] hover:border-[#B8A499]'
              }"
            >
              <span class="${isVoted ? 'heart-bounce' : ''}">${isVoted ? '❤️' : '🤍'}</span>
              <span>${plan.likes}</span>
            </button>
            <!-- 通報（主張しすぎない小さなリンク。誤タップ防止でタップ領域は確保） -->
            <button
              onclick="window.reportPlanHandler(${plan.id})"
              aria-label="このプランを運営に通報する"
              class="report-btn flex items-center justify-center w-9 h-9 rounded-full text-[10px] text-[#A99B92] hover:text-rose-600 hover:bg-rose-50 transition"
            >通報</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // 8.5 画面下部のバナー広告（AdMob / iOSネイティブのみ）
  // ==========================================
  // Web ブラウザでは admob.js 側が何もせず、エラーも出さない。
  // 呼び出しでアプリ本体が止まらないよう、必ず try で包む。
  function initAdMobBanner() {
    try {
      const api = window.Date15AdMob;
      if (!api || typeof api.AdMobManager !== 'function') return;
      const adMob = new api.AdMobManager();
      window.date15AdMob = adMob;
    } catch (err) {
      console.warn('[AdMob] 初期化に失敗しました（アプリの動作には影響ありません）:', err);
    }
  }

  // ==========================================
  // 8.6 iPhoneアプリだけの3タブ表示と起動時のルール説明
  // ==========================================
  // Webブラウザでは何もせず、今の1ページ縦長表示のまま。
  // 初回起動のルール説明を閉じてから広告（ATTのダイアログ）を出し、
  // 起動直後に「ルール説明」と「ATT」の2枚が重ならないようにする。
  function initTabsAndRules() {
    try {
      const tabsApi = window.Date15Tabs;
      if (!tabsApi || typeof tabsApi.init !== 'function') return { autoShown: false };
      return tabsApi.init({ onRulesClosed: initAdMobBanner }) || { autoShown: false };
    } catch (err) {
      console.warn('[Tabs] 3タブ表示の初期化に失敗しました（表示は従来どおり）:', err);
      return { autoShown: false };
    }
  }

  // ==========================================
  // 9. イベントリスナー初期化
  // ==========================================
  window.addEventListener('DOMContentLoaded', () => {
    initCharGrid();
    loadData();

    // iPhoneアプリだけ：3タブ表示＋初回起動のルール説明（Web版は何もしない）
    const ui = initTabsAndRules();
    if (!ui || !ui.autoShown) initAdMobBanner();

    const planInput = document.getElementById('planInput');
    if (planInput) {
      planInput.addEventListener('input', (e) => {
        updateCharGrid(e.target.value);
      });
      planInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && countChars(planInput.value.trim()) === 15) {
          submitPlan();
        }
      });
    }

    document.getElementById('btnClearInput')?.addEventListener('click', () => {
      if (planInput) {
        planInput.value = '';
        updateCharGrid('');
        planInput.focus();
      }
    });

    document.getElementById('btnSubmitPlan')?.addEventListener('click', submitPlan);
    document.getElementById('btnSpinRoulette')?.addEventListener('click', spinRoulette);
    document.getElementById('btnLikeRoulette')?.addEventListener('click', async () => {
      if (!state.selectedPlan) return;
      await toggleLike(state.selectedPlan.id);
    });
    document.getElementById('btnShareRoulette')?.addEventListener('click', shareResultToX);

    const sortLikes = document.getElementById('sortLikes');
    const sortNewest = document.getElementById('sortNewest');
    const sortRandom = document.getElementById('sortRandom');

    function setActiveSort(btn, sortKey) {
      [sortLikes, sortNewest, sortRandom].forEach(b => {
        b.className = 'min-h-[32px] py-1 rounded-lg text-[#6E564B] hover:text-[#2D231E] text-center whitespace-nowrap transition';
      });
      btn.className = 'min-h-[32px] py-1 rounded-lg font-bold bg-[#FFFDFB] text-[#2D231E] shadow-xs text-center whitespace-nowrap transition';
      state.currentSort = sortKey;
      renderPlans();
    }

    sortLikes?.addEventListener('click', () => setActiveSort(sortLikes, 'likes'));
    sortNewest?.addEventListener('click', () => setActiveSort(sortNewest, 'newest'));
    sortRandom?.addEventListener('click', () => setActiveSort(sortRandom, 'random'));

    window.toggleLikeHandler = toggleLike;
    window.reportPlanHandler = reportPlan;

    // 動作確認（単体テスト・手動デバッグ）用の小さなAPI。UIには影響しない。
    window.Date15App = {
      checkSensitiveWord,
      ngReasonLabel,
      visiblePlans,
      reportPlan,
      submitPlan,
      getPlans: () => state.plans
    };
  });

})();
