/**
 * 理想のデートプランを15文字でどうぞ。 - アプリスクリプト
 */

(() => {
  'use strict';

  // ==========================================
  // 1. 初期プリセット10選（翔大さん考案・ピッタリ15文字版）
  // ==========================================
  const INITIAL_PLANS = [
    { id: 1, text: '散歩中の可愛い犬を数えて歩こう', likes: 142, createdAt: 1731248000000 },
    { id: 2, text: '古本屋で五百円分選び合ってみる', likes: 218, createdAt: 1731248100000 },
    { id: 3, text: '昔ながらの駄菓子屋で三百円豪遊', likes: 175, createdAt: 1731248200000 },
    { id: 4, text: 'レンタルビデオでジャケ買い勝負', likes: 98, createdAt: 1731248300000 },
    { id: 5, text: 'ガチャガチャを二人でフルコンプ', likes: 164, createdAt: 1731248400000 },
    { id: 6, text: '深夜のドライブで静かな海を見に', likes: 289, createdAt: 1731248500000 },
    { id: 7, text: 'デパ地下試食コーナー全種類制覇', likes: 112, createdAt: 1731248600000 },
    { id: 8, text: 'ボードゲームカフェで真剣勝負す', likes: 134, createdAt: 1731248700000 },
    { id: 9, text: '見知らぬ駅でふらり途中下車する', likes: 203, createdAt: 1731248800000 },
    { id: 10, text: '早朝の市場で熱い朝ラーメン食う', likes: 251, createdAt: 1731248900000 }
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

  // 文字列の文字数を正確にカウント（サロゲートペア対応）
  function countChars(str) {
    return [...str].length;
  }

  // ==========================================
  // 3. データ読込 & Supabase連携
  // ==========================================
  async function loadData() {
    // 投票済みIDの読込
    try {
      const savedVotes = localStorage.getItem(STORAGE_KEY_VOTES);
      if (savedVotes) {
        state.votedIds = new Set(JSON.parse(savedVotes));
      }
    } catch (e) {}

    // Supabase 設定チェック
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
              likes: r.likes || 0,
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

    // ローカルストレージからの読込フォールバック
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

  // ==========================================
  // 4. 15文字原稿用紙グリッドの生成とリアルタイム検証
  // ==========================================
  function initCharGrid() {
    const grid = document.getElementById('charGrid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 0; i < 15; i++) {
      const cell = document.createElement('div');
      cell.className = 'char-cell rounded-lg text-sm md:text-base';
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

    // グリッドセルの描画
    for (let i = 0; i < 15; i++) {
      const cell = document.getElementById(`cell-${i}`);
      if (!cell) continue;

      if (i < len) {
        cell.textContent = chars[i];
        cell.className = `char-cell rounded-lg text-sm md:text-base filled ${len === 15 ? 'perfect' : ''}`;
      } else {
        cell.textContent = '';
        cell.className = 'char-cell rounded-lg text-sm md:text-base';
      }
    }

    // 判定演出
    if (len === 15) {
      // 15文字ピッタリ！
      countBadge.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300 animate-pulse';
      msgEl.textContent = '✨ 15文字ピッタリ！このまま投稿できます！';
      msgEl.className = 'text-[11px] font-bold text-rose-600 transition-all';
      submitBtn.disabled = false;
      submitBtn.className = 'w-full py-3 px-6 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#E07A7A] to-[#D46B6B] hover:opacity-95 active:scale-[0.99] shadow-md transition flex items-center justify-center space-x-2 cursor-pointer';
    } else if (len > 15) {
      // 文字数オーバー
      const over = len - 15;
      countBadge.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-200 border border-rose-700';
      msgEl.textContent = `⚠️ ${over}文字オーバーです（15文字丁度に削ってね）`;
      msgEl.className = 'text-[11px] font-bold text-rose-500 transition-all';
      submitBtn.disabled = true;
      submitBtn.className = 'w-full py-3 px-6 rounded-xl font-bold text-sm text-white bg-[#D6C7BE] cursor-not-allowed transition flex items-center justify-center space-x-2 shadow-xs';
    } else {
      // 不足
      const remain = 15 - len;
      countBadge.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#FAF7F5] text-[#8C7A70] border border-[#D6C7BE]';
      msgEl.textContent = len === 0 ? 'ピッタリ15文字になると投稿できます' : `あと ${remain} 文字でピッタリです`;
      msgEl.className = 'text-[11px] text-[#A8988F] transition-all';
      submitBtn.disabled = true;
      submitBtn.className = 'w-full py-3 px-6 rounded-xl font-bold text-sm text-white bg-[#D6C7BE] cursor-not-allowed transition flex items-center justify-center space-x-2 shadow-xs';
    }
  }

  // ==========================================
  // 5. 投稿処理
  // ==========================================
  async function submitPlan() {
    const input = document.getElementById('planInput');
    if (!input) return;

    const rawText = input.value.trim();
    if (countChars(rawText) !== 15) {
      alert('ピッタリ15文字で入力してください。');
      return;
    }

    const cfg = window.DATE_CONFIG || {};
    const newId = Date.now();
    const newPlan = {
      id: newId,
      text: rawText,
      likes: 1,
      createdAt: Date.now()
    };

    // Supabase 送信
    if (state.isOnlineDB && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      try {
        await fetch(`${cfg.SUPABASE_URL}/rest/v1/${cfg.TABLE_NAME}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': cfg.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${cfg.SUPABASE_ANON_KEY}`,
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ text: rawText, likes: 1 })
        });
      } catch (e) {
        console.warn('Supabase post failed, saving locally:', e);
      }
    } else {
      saveLocalPlans(newPlan);
    }

    state.plans.unshift(newPlan);
    state.votedIds.add(newPlan.id);
    saveLocalVotes();

    // 紙吹雪演出
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    }

    // フォーム初期化
    input.value = '';
    updateCharGrid('');
    renderPlans();
    updateRouletteCount();

    alert('素敵な15文字のデートプランを投稿しました！✨');
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

    // Supabase RPC または 直接更新
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
  }

  // ==========================================
  // 7. 運命のルーレット機能
  // ==========================================
  function spinRoulette() {
    if (state.isSpinning || state.plans.length === 0) return;
    state.isSpinning = true;

    const resultEl = document.getElementById('rouletteResult');
    const charsCountEl = document.getElementById('rouletteCharsCount');
    const spinBtn = document.getElementById('btnSpinRoulette');
    const shareBtn = document.getElementById('btnShareRoulette');

    resultEl.classList.add('slot-rolling', 'text-rose-500');
    spinBtn.disabled = true;
    charsCountEl.classList.add('hidden');
    shareBtn.classList.add('hidden');

    let rollCount = 0;
    const maxRolls = 22; // 約1.8秒回る
    const interval = 80;

    const timer = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * state.plans.length);
      resultEl.textContent = `「${state.plans[randomIndex].text}」`;
      rollCount++;

      if (rollCount >= maxRolls) {
        clearInterval(timer);
        // 最終決定
        const finalPlan = state.plans[Math.floor(Math.random() * state.plans.length)];
        state.selectedPlan = finalPlan;

        resultEl.classList.remove('slot-rolling', 'text-rose-500');
        resultEl.textContent = `「${finalPlan.text}」`;
        charsCountEl.classList.remove('hidden');
        shareBtn.classList.remove('hidden');
        spinBtn.disabled = false;
        state.isSpinning = false;

        // 紙吹雪
        if (typeof confetti === 'function') {
          confetti({
            particleCount: 80,
            spread: 80,
            origin: { y: 0.4 }
          });
        }
      }
    }, interval);
  }

  function shareResultToX() {
    if (!state.selectedPlan) return;
    const text = `今日の理想のデートは【${state.selectedPlan.text}】に決まりました！☕✨\n\nたった15文字で綴る、愛おしい日常。\n#理想のデート15文字 #デートプラン\n`;
    const url = window.location.href;
    const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(xUrl, '_blank');
  }

  function updateRouletteCount() {
    const el = document.getElementById('rouletteTotalCount');
    if (el) el.textContent = state.plans.length;
  }

  // ==========================================
  // 8. プラン一覧レンダリング & ソート
  // ==========================================
  function renderPlans() {
    const container = document.getElementById('plansContainer');
    if (!container) return;

    let sorted = [...state.plans];
    if (state.currentSort === 'likes') {
      sorted.sort((a, b) => b.likes - a.likes);
    } else if (state.currentSort === 'newest') {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    } else if (state.currentSort === 'random') {
      sorted.sort(() => Math.random() - 0.5);
    }

    if (sorted.length === 0) {
      container.innerHTML = '<div class="text-center py-10 text-xs text-[#A8988F]">まだ投稿がありません。最初の15文字を投稿してみよう！</div>';
      return;
    }

    container.innerHTML = sorted.map((plan, index) => {
      const isVoted = state.votedIds.has(plan.id);
      const isTop3 = state.currentSort === 'likes' && index < 3;
      const rankBadge = isTop3 
        ? `<span class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${index === 0 ? 'bg-amber-400 text-amber-950' : index === 1 ? 'bg-slate-300 text-slate-800' : 'bg-amber-600 text-amber-50'}">${index + 1}</span>`
        : `<span class="w-5 h-5 flex items-center justify-center text-[10px] text-[#A8988F] font-bold">${index + 1}</span>`;

      return `
        <div class="bg-white rounded-xl p-4 border border-[#E8DFD8] shadow-xs flex items-center justify-between hover:border-[#D6C7BE] transition group">
          <div class="flex items-center space-x-3 flex-1 min-w-0 pr-2">
            ${rankBadge}
            <div class="min-w-0 flex-1">
              <div class="text-sm md:text-base font-bold font-mincho text-[#2D231E] tracking-wider truncate">
                ${plan.text}
              </div>
              <div class="text-[10px] text-[#A8988F] mt-0.5">
                15文字ピッタリ
              </div>
            </div>
          </div>

          <!-- いいねボタン -->
          <button 
            onclick="window.toggleLikeHandler(${plan.id})" 
            class="flex items-center space-x-1.5 px-3 py-1.5 rounded-full border transition active:scale-95 text-xs font-bold ${
              isVoted 
                ? 'bg-rose-50 border-rose-300 text-rose-600 shadow-xs' 
                : 'bg-[#FAF7F5] border-[#E8DFD8] text-[#8C7A70] hover:border-[#D6C7BE]'
            }"
          >
            <span class="${isVoted ? 'heart-bounce' : ''}">${isVoted ? '❤️' : '🤍'}</span>
            <span>${plan.likes}</span>
          </button>
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // 9. イベントリスナー初期化
  // ==========================================
  window.addEventListener('DOMContentLoaded', () => {
    initCharGrid();
    loadData();

    // 入力監視
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

    // クリアボタン
    document.getElementById('btnClearInput')?.addEventListener('click', () => {
      if (planInput) {
        planInput.value = '';
        updateCharGrid('');
        planInput.focus();
      }
    });

    // 投稿ボタン
    document.getElementById('btnSubmitPlan')?.addEventListener('click', submitPlan);

    // ルーレット
    document.getElementById('btnSpinRoulette')?.addEventListener('click', spinRoulette);
    document.getElementById('btnShareRoulette')?.addEventListener('click', shareResultToX);

    // ソート切り替え
    const sortLikes = document.getElementById('sortLikes');
    const sortNewest = document.getElementById('sortNewest');
    const sortRandom = document.getElementById('sortRandom');

    function setActiveSort(btn, sortKey) {
      [sortLikes, sortNewest, sortRandom].forEach(b => {
        b.className = 'px-3 py-1 rounded-lg text-[#8C7A70] hover:text-[#3D312A] transition';
      });
      btn.className = 'px-3 py-1 rounded-lg font-bold bg-white text-[#3D312A] shadow-xs transition';
      state.currentSort = sortKey;
      renderPlans();
    }

    sortLikes?.addEventListener('click', () => setActiveSort(sortLikes, 'likes'));
    sortNewest?.addEventListener('click', () => setActiveSort(sortNewest, 'newest'));
    sortRandom?.addEventListener('click', () => setActiveSort(sortRandom, 'random'));

    // ZINE企画モーダル
    const zineModal = document.getElementById('zineModal');
    document.getElementById('btnAboutZine')?.addEventListener('click', () => {
      zineModal?.classList.remove('hidden');
    });
    document.getElementById('btnCloseZineModal')?.addEventListener('click', () => {
      zineModal?.classList.add('hidden');
    });
    document.getElementById('btnZineModalClose')?.addEventListener('click', () => {
      zineModal?.classList.add('hidden');
    });

    // グローバル公開用ハンドラ
    window.toggleLikeHandler = toggleLike;
  });

})();
