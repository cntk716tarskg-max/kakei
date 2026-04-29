/* =====================================================
   firestore.js — Firebase Auth + Firestore 同期
   ・USE_FIRESTORE = false の間は完全に無効

   【読み取り戦略】
   起動時 :
     meta/info を1件取得しバージョン比較
     初回(Firestoreが空) → ローカルデータを全送信
     一致              → 以降の読み取り0件
     不一致            → profile(1) + 表示月(1) を取得 → _syncNeeded=true

   月切替時 :
     _syncNeeded=false → 0件（バージョン一致で起動）
     _syncNeeded=true  → 未取得の月のみ1件取得

   【データ消失対策】
   ・タブ切替・バックグラウンド遷移時にデバウンス中のデータを即送信
   ===================================================== */

const FirestoreDB = (() => {

  let _db           = null;
  let _uid          = null;
  let _ready        = false;
  let _auth         = null;
  let _mode         = 'signin';
  let _cloudVersion = null;
  let _syncNeeded   = false;
  const _pulledMonths = new Set();

  const VER_KEY = 'kakei_cloud_ver_v2';

  /* ─────────────────────────────────────────────────────
     バージョン管理
  ───────────────────────────────────────────────────── */

  function _localVer()      { return localStorage.getItem(VER_KEY) || '0'; }
  function _saveLocalVer(v) { localStorage.setItem(VER_KEY, String(v)); }
  function _clearLocalVer() { localStorage.removeItem(VER_KEY); }

  /* ─────────────────────────────────────────────────────
     月キー生成ヘルパー（直近 n ヶ月）
  ───────────────────────────────────────────────────── */

  function _recentMonthKeys(n) {
    const keys = [];
    const d = new Date();
    for (let i = 0; i < n; i++) {
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      d.setMonth(d.getMonth() - 1);
    }
    return keys;
  }

  /* ─────────────────────────────────────────────────────
     デバウンスタイマー
  ───────────────────────────────────────────────────── */

  const _monthTimers  = {}; // { "2026-04": timerId }
  let   _profileTimer = null;

  /* ─────────────────────────────────────────────────────
     バックグラウンド移行時のフラッシュ
     タブ切替・アプリ最小化・別アプリ切替時に
     デバウンス待機中のデータを即座に送信する
  ───────────────────────────────────────────────────── */

  function _flushPending() {
    if (!_ready) return;

    // 保留中の月データを全て即送信
    Object.keys(_monthTimers).forEach(key => {
      clearTimeout(_monthTimers[key]);
      delete _monthTimers[key];
      const [y, m] = key.split('-').map(Number);
      _doPushMonthData(y, m).catch(() => {});
    });

    // 保留中のプロフィールを即送信
    if (_profileTimer !== null) {
      clearTimeout(_profileTimer);
      _profileTimer = null;
      _doPushProfile().catch(() => {});
    }
  }

  // タブ切替・バックグラウンド遷移を検知
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _flushPending();
  });
  // iOS Safari 向け（pagehide は visibilitychange より確実に発火）
  window.addEventListener('pagehide', _flushPending);

  /* ─────────────────────────────────────────────────────
     初期化
  ───────────────────────────────────────────────────── */

  function init() {
    if (!USE_FIRESTORE) return Promise.resolve();
    if (typeof firebase === 'undefined') {
      console.warn('[FirestoreDB] Firebase SDK が読み込まれていません。');
      return Promise.resolve();
    }
    if (firebase.apps.length === 0) firebase.initializeApp(FIREBASE_CONFIG);

    _auth = firebase.auth();
    _bindAuthEnter();

    _auth.onAuthStateChanged(user => {
      if (user) {
        _onLogin(user);
      } else {
        _ready        = false;
        _uid          = null;
        _db           = null;
        _cloudVersion = null;
        _syncNeeded   = false;
        _pulledMonths.clear();
        document.getElementById('auth-logout-btn')?.classList.add('hidden');
        _showOverlay();
      }
    });

    return Promise.resolve();
  }

  async function _onLogin(user) {
    _uid   = user.uid;
    _db    = firebase.firestore();
    _ready = true;
    _hideOverlay();
    document.getElementById('auth-logout-btn')?.classList.remove('hidden');

    // ① バージョン確認（1 read）
    let metaSnap;
    try {
      metaSnap = await _userRef().collection('meta').doc('info').get();
    } catch (e) {
      console.warn('[FirestoreDB] バージョン取得失敗:', e.message);
      return;
    }
    _cloudVersion = metaSnap.exists ? (metaSnap.data().version || 0) : 0;

    // ② Firestoreにデータが存在しない → ローカルを初期送信
    if (!metaSnap.exists || _cloudVersion === 0) {
      console.log('[FirestoreDB] Firestoreが空 — ローカルデータを送信します');
      await _pushInitialData();
      _syncNeeded = false;
      if (typeof App !== 'undefined') App.refresh();
      return;
    }

    // ③ バージョン一致 → スキップ
    if (String(_cloudVersion) === _localVer()) {
      console.log('[FirestoreDB] バージョン一致 — pull スキップ (読み取り: 1件)');
      _syncNeeded = false;
      return;
    }

    // ④ バージョン不一致 → _syncNeeded=true、profile + 表示月を取得
    console.log('[FirestoreDB] バージョン不一致 — 同期開始');
    _syncNeeded = true;

    try { await _pullProfile(); } catch (e) {
      console.warn('[FirestoreDB] profile 取得失敗:', e.message);
    }

    const appState = typeof App !== 'undefined' ? App.getState() : null;
    if (appState) {
      try { await _pullMonth(appState.year, appState.month); } catch (e) {
        console.warn('[FirestoreDB] 月データ取得失敗:', e.message);
      }
    }

    // ローカルバージョン更新（次回ログイン時のスキップ判定用）
    // ※ _syncNeeded は true のまま → 月切替のたびに未取得月を pull し続ける
    _saveLocalVer(_cloudVersion);

    if (typeof App !== 'undefined') App.refresh();
    console.log('[FirestoreDB] 初期同期完了');
  }

  /* ─────────────────────────────────────────────────────
     初期送信：Firestore が空のとき、ローカルデータを全送信
  ───────────────────────────────────────────────────── */

  async function _pushInitialData() {
    const local = Storage.loadAll();
    const hasData = (local.categories && local.categories.length > 0)
                 || Object.keys(local.months || {}).length > 0;

    if (!hasData) {
      // ローカルも空 → 何もしない
      console.log('[FirestoreDB] ローカルデータなし — 送信スキップ');
      return;
    }

    const ver   = Date.now();
    const batch = _db.batch();

    // プロフィール（カテゴリ・入力候補）
    batch.set(_userRef().collection('data').doc('profile'), {
      categories:  local.categories  || [],
      suggestions: (local.suggestions || []).slice(0, 200)
    });

    // 直近13ヶ月分の月データ
    const keys = _recentMonthKeys(13);
    for (const key of keys) {
      if (local.months[key]) {
        batch.set(_userRef().collection('months').doc(key), local.months[key]);
      }
    }

    // バージョン記録
    batch.set(_userRef().collection('meta').doc('info'), { version: ver });

    try {
      await batch.commit();
      _cloudVersion = ver;
      _saveLocalVer(ver);
      console.log('[FirestoreDB] 初期送信完了');
    } catch (e) {
      console.warn('[FirestoreDB] 初期送信失敗:', e.message);
    }
  }

  function isReady() { return _ready; }

  /* ─────────────────────────────────────────────────────
     月切替時の呼び出し口
  ───────────────────────────────────────────────────── */

  async function ensureMonth(year, month) {
    if (!_ready || !_syncNeeded) return;

    const key = Storage.monthKey(year, month);
    if (_pulledMonths.has(key)) return;

    await _pullMonth(year, month);
    if (typeof App !== 'undefined') App.refresh();
  }

  /* ─────────────────────────────────────────────────────
     個別 pull
  ───────────────────────────────────────────────────── */

  async function _pullProfile() {
    const snap = await _userRef().collection('data').doc('profile').get();
    if (!snap.exists) return;
    const prof  = snap.data();
    const local = Storage.loadAll();
    if (Array.isArray(prof.categories))  local.categories  = prof.categories;
    if (Array.isArray(prof.suggestions)) local.suggestions = prof.suggestions;
    Storage.saveAll(local);
  }

  async function _pullMonth(year, month) {
    const key = Storage.monthKey(year, month);
    _pulledMonths.add(key); // fetch前に追加して重複防止
    try {
      const snap = await _userRef().collection('months').doc(key).get();
      if (snap.exists) {
        const local = Storage.loadAll();
        local.months[key] = snap.data();
        Storage.saveAll(local);
      }
    } catch (e) {
      _pulledMonths.delete(key); // エラー時はリトライ可能にする
      throw e;
    }
  }

  /* ─────────────────────────────────────────────────────
     Auth オーバーレイ
  ───────────────────────────────────────────────────── */

  function _showOverlay() {
    document.getElementById('auth-overlay')?.classList.remove('hidden');
    _setMode('signin');
  }
  function _hideOverlay() {
    document.getElementById('auth-overlay')?.classList.add('hidden');
  }

  function _setMode(mode) {
    _mode = mode;
    document.querySelectorAll('.auth-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.mode === mode)
    );
    const btn = document.getElementById('auth-submit-btn');
    if (btn) btn.textContent = mode === 'signin' ? 'ログイン' : '新規登録';
    document.getElementById('auth-reset-btn')?.classList.toggle('hidden', mode !== 'signin');
    _clearMsg();
  }
  function switchMode(mode) { _setMode(mode); }

  function _setError(msg) {
    const err = document.getElementById('auth-error');
    if (err) { err.textContent = msg; err.classList.remove('hidden'); }
    document.getElementById('auth-success')?.classList.add('hidden');
  }
  function _setSuccess(msg) {
    const suc = document.getElementById('auth-success');
    if (suc) { suc.textContent = msg; suc.classList.remove('hidden'); }
    document.getElementById('auth-error')?.classList.add('hidden');
  }
  function _clearMsg() {
    ['auth-error', 'auth-success'].forEach(id =>
      document.getElementById(id)?.classList.add('hidden')
    );
  }

  function _bindAuthEnter() {
    setTimeout(() => {
      const emailEl = document.getElementById('auth-email');
      const passEl  = document.getElementById('auth-password');
      emailEl?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); passEl?.focus(); }
      });
      passEl?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); submitAuth(); }
      });
    }, 80);
  }

  /* ─────────────────────────────────────────────────────
     ログイン / 新規登録
  ───────────────────────────────────────────────────── */

  async function submitAuth() {
    const email = (document.getElementById('auth-email')?.value  || '').trim();
    const pass  = (document.getElementById('auth-password')?.value || '');
    if (!email || !pass) { _setError('メールアドレスとパスワードを入力してください'); return; }
    const btn = document.getElementById('auth-submit-btn');
    if (btn) btn.disabled = true;
    try {
      if (_mode === 'signin') {
        await _auth.signInWithEmailAndPassword(email, pass);
      } else {
        await _auth.createUserWithEmailAndPassword(email, pass);
      }
    } catch (e) {
      _setError(_errMsg(e.code));
      if (btn) btn.disabled = false;
    }
  }

  async function resetPassword() {
    const email = (document.getElementById('auth-email')?.value || '').trim();
    if (!email) { _setError('メールアドレスを入力してください'); return; }
    try {
      await _auth.sendPasswordResetEmail(email);
      _setSuccess('パスワードリセットのメールを送信しました');
    } catch (e) { _setError(_errMsg(e.code)); }
  }

  async function signOut() {
    if (!_auth) return;
    _flushPending(); // ログアウト前に未送信データをフラッシュ
    _clearLocalVer();
    _cloudVersion = null;
    _syncNeeded   = false;
    _pulledMonths.clear();
    await _auth.signOut();
  }

  function _errMsg(code) {
    const map = {
      'auth/invalid-email':          'メールアドレスの形式が正しくありません',
      'auth/user-not-found':         'メールアドレスまたはパスワードが違います',
      'auth/wrong-password':         'メールアドレスまたはパスワードが違います',
      'auth/invalid-credential':     'メールアドレスまたはパスワードが違います',
      'auth/email-already-in-use':   'このメールアドレスはすでに使われています',
      'auth/weak-password':          'パスワードは6文字以上で入力してください',
      'auth/too-many-requests':      'しばらく待ってから再試行してください',
      'auth/network-request-failed': 'ネットワークエラーが発生しました',
    };
    return map[code] || 'エラーが発生しました（' + code + '）';
  }

  /* ─────────────────────────────────────────────────────
     push 系（デバウンス + バッチ書き込み）
  ───────────────────────────────────────────────────── */

  function _userRef() { return _db.collection('users').doc(_uid); }

  function pushMonthData(year, month) {
    if (!_ready) return;
    const key = Storage.monthKey(year, month);
    clearTimeout(_monthTimers[key]);
    _monthTimers[key] = setTimeout(() => {
      delete _monthTimers[key];
      _doPushMonthData(year, month).catch(() => {});
    }, 3000);
  }

  async function _doPushMonthData(year, month) {
    const key = Storage.monthKey(year, month);
    const md  = Storage.getMonthData(year, month);
    const ver = Date.now();
    const batch = _db.batch();
    batch.set(_userRef().collection('months').doc(key), md);
    batch.set(_userRef().collection('meta').doc('info'), { version: ver });
    await batch.commit();
    _cloudVersion = ver;
    _saveLocalVer(ver);
  }

  function pushProfile() {
    if (!_ready) return;
    clearTimeout(_profileTimer);
    _profileTimer = setTimeout(() => {
      _profileTimer = null;
      _doPushProfile().catch(() => {});
    }, 3000);
  }

  async function _doPushProfile() {
    const ver = Date.now();
    const batch = _db.batch();
    batch.set(_userRef().collection('data').doc('profile'), {
      categories:  Storage.getCategories(),
      suggestions: Storage.getSuggestions()
    });
    batch.set(_userRef().collection('meta').doc('info'), { version: ver });
    await batch.commit();
    _cloudVersion = ver;
    _saveLocalVer(ver);
  }

  /* ===== 公開 ===== */
  return {
    init, isReady,
    ensureMonth,
    submitAuth, resetPassword, switchMode, signOut,
    pushMonthData, pushProfile
  };
})();
