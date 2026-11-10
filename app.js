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

  // ==========================================
  // 4. 15文字原稿用紙グリッド (コンパクト版)
  // ==========================================
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

    if (len === 15) {
      countBadge.className = 'shrink-0 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-300 animate-pulse';
      msgEl.textContent = '✨ 15文字ピッタリ！このまま投稿できます！';
      msgEl.className = 'text-[9.5px] font-bold text-rose-600 whitespace-nowrap transition-all';
      submitBtn.disabled = false;
      submitBtn.className = 'w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#E26D6D] to-[#D65D5D] hover:opacity-95 active:scale-[0.99] shadow-md transition flex items-center justify-center space-x-1.5 cursor-pointer';
    } else if (len > 15) {
      const over = len - 15;
      countBadge.className = 'shrink-0 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-950 text-rose-200 border border-rose-700';
      msgEl.textContent = `⚠️ ${over}文字オーバーです（15文字丁度に削ってね）`;
      msgEl.className = 'text-[9.5px] font-bold text-rose-500 whitespace-nowrap transition-all';
      submitBtn.disabled = true;
      submitBtn.className = 'w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-[#D8C8BF] cursor-not-allowed transition flex items-center justify-center space-x-1.5 shadow-xs';
    } else {
      const remain = 15 - len;
      countBadge.className = 'shrink-0 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FAF5F2] text-[#8C766B] border border-[#D8C8BF]';
      msgEl.textContent = len === 0 ? 'ピッタリ15文字になると投稿できます' : `あと ${remain} 文字でピッタリです`;
      msgEl.className = 'text-[9.5px] text-[#A89488] whitespace-nowrap transition-all';
      submitBtn.disabled = true;
      submitBtn.className = 'w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-[#D8C8BF] cursor-not-allowed transition flex items-center justify-center space-x-1.5 shadow-xs';
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
    if (countChars(rawText) !== 15) {
      alert('ピッタリ15文字で入力してください。');
      return;
    }

    const author = (authorInput && authorInput.value.trim()) ? authorInput.value.trim() : '匿名希望';
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
          body: JSON.stringify({ text: rawText, author: author, likes: 1 })
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
  }

  // ==========================================
  // 7. 運命のルーレット機能
  // ==========================================
  function spinRoulette() {
    if (state.isSpinning || state.plans.length === 0) return;
    state.isSpinning = true;

    const resultEl = document.getElementById('rouletteResult');
    const authorEl = document.getElementById('rouletteAuthor');
    const charsCountEl = document.getElementById('rouletteCharsCount');
    const spinBtn = document.getElementById('btnSpinRoulette');
    const shareBtn = document.getElementById('btnShareRoulette');

    resultEl.classList.add('slot-rolling', 'text-rose-500');
    spinBtn.disabled = true;
    charsCountEl.classList.add('hidden');
    authorEl.classList.add('hidden');
    shareBtn.classList.add('hidden');

    let rollCount = 0;
    const maxRolls = 20;
    const interval = 80;

    const timer = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * state.plans.length);
      resultEl.textContent = `「${state.plans[randomIndex].text}」`;
      rollCount++;

      if (rollCount >= maxRolls) {
        clearInterval(timer);
        const finalPlan = state.plans[Math.floor(Math.random() * state.plans.length)];
        state.selectedPlan = finalPlan;

        resultEl.classList.remove('slot-rolling', 'text-rose-500');
        resultEl.textContent = `「${finalPlan.text}」`;
        authorEl.textContent = `by ${finalPlan.author || '匿名希望'}`;
        authorEl.classList.remove('hidden');
        charsCountEl.classList.remove('hidden');
        shareBtn.classList.remove('hidden');
        spinBtn.disabled = false;
        state.isSpinning = false;

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
    const authorText = ` (by ${state.selectedPlan.author || '匿名希望'})`;
    const text = `今日のふたりのデートは【${state.selectedPlan.text}】${authorText}に決まりました！💖✨\n\nたった15文字で綴る、愛おしいデート。\n#理想のデート15文字 #デートプラン\n`;
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
      container.innerHTML = '<div class="text-center py-6 text-xs text-[#A89488]">まだ投稿がありません。最初の15文字を投稿してみよう！</div>';
      return;
    }

    container.innerHTML = sorted.map((plan, index) => {
      const isVoted = state.votedIds.has(plan.id);
      const isTop3 = state.currentSort === 'likes' && index < 3;
      const rankBadge = isTop3 
        ? `<span class="w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold ${index === 0 ? 'bg-amber-400 text-amber-950' : index === 1 ? 'bg-slate-300 text-slate-800' : 'bg-amber-600 text-amber-50'}">${index + 1}</span>`
        : `<span class="w-4 h-4 shrink-0 flex items-center justify-center text-[9px] text-[#A89488] font-bold">${index + 1}</span>`;

      return `
        <div class="bg-white rounded-xl p-3 border border-[#E8DDD5] shadow-xs flex items-center justify-between hover:border-[#D8C8BF] transition">
          <div class="flex items-center space-x-2 flex-1 min-w-0 pr-2">
            ${rankBadge}
            <div class="min-w-0 flex-1">
              <div class="text-xs sm:text-sm font-bold font-mincho text-[#2D231E] tracking-tight truncate whitespace-nowrap">
                ${plan.text}
              </div>
              <div class="text-[9px] text-[#8C766B] flex items-center space-x-1 mt-0.5 whitespace-nowrap">
                <span class="text-rose-500 font-bold">15文字</span>
                <span>·</span>
                <span class="truncate">by ${plan.author || '匿名希望'}</span>
              </div>
            </div>
          </div>

          <!-- いいねボタン -->
          <button 
            onclick="window.toggleLikeHandler(${plan.id})" 
            class="shrink-0 flex items-center space-x-1 px-2.5 py-1 rounded-full border transition active:scale-95 text-[11px] font-bold ${
              isVoted 
                ? 'bg-rose-50 border-rose-300 text-rose-600 shadow-xs' 
                : 'bg-[#FAF5F2] border-[#E8DDD5] text-[#8C766B] hover:border-[#D8C8BF]'
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
    document.getElementById('btnShareRoulette')?.addEventListener('click', shareResultToX);

    const sortLikes = document.getElementById('sortLikes');
    const sortNewest = document.getElementById('sortNewest');
    const sortRandom = document.getElementById('sortRandom');

    function setActiveSort(btn, sortKey) {
      [sortLikes, sortNewest, sortRandom].forEach(b => {
        b.className = 'py-1 rounded-lg text-[#8C766B] hover:text-[#2D231E] text-center whitespace-nowrap transition';
      });
      btn.className = 'py-1 rounded-lg font-bold bg-white text-[#2D231E] shadow-xs text-center whitespace-nowrap transition';
      state.currentSort = sortKey;
      renderPlans();
    }

    sortLikes?.addEventListener('click', () => setActiveSort(sortLikes, 'likes'));
    sortNewest?.addEventListener('click', () => setActiveSort(sortNewest, 'newest'));
    sortRandom?.addEventListener('click', () => setActiveSort(sortRandom, 'random'));

    window.toggleLikeHandler = toggleLike;
  });

})();
