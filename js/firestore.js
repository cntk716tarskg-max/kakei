/* =====================================================
   firestore.js — Firebase Auth + Firestore 同期
   ・USE_FIRESTORE = false の間は完全に無効

   【読み取り戦略】
   起動時 :
     meta/info を1件取得しバージョン比較
     一致   → 以降の読み取り0件（ローカルは最新）
     不一致 → profile(1) + 表示月(1) を取得 → _syncNeeded=true

   月切替時 :
     _syncNeeded=false → 0件（バージョン一致で起動）
     _syncNeeded=true  → 未取得の月のみ1件取得

   書き込み時 :
     デバウンス後、データ + meta/info.version をバッチ書き込み
     → ローカルバージョンも更新し次回起動でスキップ対象に
   ===================================================== */

const FirestoreDB = (() => {

  let _db          = null;
  let _uid         = null;
  let _ready       = false;
  let _auth        = null;
  let _mode        = 'signin';
  let _cloudVersion = null;
  let _syncNeeded  = false;        // バージョン不一致でログインした場合 true
  const _pulledMonths = new Set(); // このセッションで取得済み（重複防止用）

  // VER_KEY を _v2 に変更することで既存ユーザーも初回に確実に同期される
  const VER_KEY = 'kakei_cloud_ver_v2';

  /* ─────────────────────────────────────────────────────
     バージョン管理ヘルパー
  ───────────────────────────────────────────────────── */

  function _localVer()      { return localStorage.getItem(VER_KEY) || '0'; }
  function _saveLocalVer(v) { localStorage.setItem(VER_KEY, String(v)); }
  function _clearLocalVer() { localStorage.removeItem(VER_KEY); }

  /* ─────────────────────────────────────────────────────
     デバウンスタイマー
  ───────────────────────────────────────────────────── */

  const _monthTimers  = {};
  let   _profileTimer = null;

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
    try {
      const metaSnap = await _userRef().collection('meta').doc('info').get();
      _cloudVersion  = metaSnap.exists ? (metaSnap.data().version || 0) : 0;
    } catch (e) {
      console.warn('[FirestoreDB] バージョン取得失敗:', e.message);
      return;
    }

    if (String(_cloudVersion) === _localVer()) {
      console.log('[FirestoreDB] バージョン一致 — pull スキップ (読み取り: 1件)');
      _syncNeeded = false;
      return;
    }

    // ② バージョン不一致 → _syncNeeded=true でセッション中の月切替でも取得を続ける
    console.log('[FirestoreDB] バージョン不一致 — 同期開始');
    _syncNeeded = true;

    // profile + 表示中の月を取得（最大2 reads）
    try {
      await _pullProfile();
    } catch (e) {
      console.warn('[FirestoreDB] profile 取得失敗:', e.message);
    }

    const appState = typeof App !== 'undefined' ? App.getState() : null;
    if (appState) {
      await _pullMonth(appState.year, appState.month);
    }

    // ローカルバージョンを更新（次回ログイン時のスキップ判定用）
    // ※ _syncNeeded は true のまま → 月切替のたびに未取得月を pull し続ける
    _saveLocalVer(_cloudVersion);

    if (typeof App !== 'undefined') App.refresh();
    console.log('[FirestoreDB] 初期同期完了 (読み取り: 最大3件)');
  }

  function isReady() { return _ready; }

  /* ─────────────────────────────────────────────────────
     月切替時の呼び出し口（app.js の _refresh から呼ばれる）

     _syncNeeded=false → 0 reads（バージョン一致で起動済み）
     _syncNeeded=true  → 未取得月のみ 1 read
     _pulledMonths に追加してから fetch → 並列呼び出しでの重複防止
  ───────────────────────────────────────────────────── */

  async function ensureMonth(year, month) {
    if (!_ready || !_syncNeeded) return;

    const key = Storage.monthKey(year, month);
    if (_pulledMonths.has(key)) return; // 取得済み or 取得中

    await _pullMonth(year, month);
    if (typeof App !== 'undefined') App.refresh();
  }

  /* ─────────────────────────────────────────────────────
     個別 pull（直接呼ばない）
  ───────────────────────────────────────────────────── */

  async function _pullProfile() {
    const snap = await _userRef().collection('data').doc('profile').get();
    if (!snap.exists) return;
    const prof  = snap.data();
    const local = Storage.loadAll();
    if (prof.categories)  local.categories  = prof.categories;
    if (prof.suggestions) local.suggestions = prof.suggestions;
    Storage.saveAll(local);
  }

  async function _pullMonth(year, month) {
    const key = Storage.monthKey(year, month);
    _pulledMonths.add(key); // fetch 前に追加して重複 fetch を防ぐ
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

  /* ─────────────────────────────────────────────────────
     タブ切替・メッセージ
  ───────────────────────────────────────────────────── */

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

  /* ─────────────────────────────────────────────────────
     Enter キーナビ
  ───────────────────────────────────────────────────── */

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

  /* ─────────────────────────────────────────────────────
     パスワードリセット
  ───────────────────────────────────────────────────── */

  async function resetPassword() {
    const email = (document.getElementById('auth-email')?.value || '').trim();
    if (!email) { _setError('メールアドレスを入力してください'); return; }
    try {
      await _auth.sendPasswordResetEmail(email);
      _setSuccess('パスワードリセットのメールを送信しました');
    } catch (e) {
      _setError(_errMsg(e.code));
    }
  }

  /* ─────────────────────────────────────────────────────
     ログアウト
  ───────────────────────────────────────────────────── */

  async function signOut() {
    if (!_auth) return;
    _clearLocalVer();
    _cloudVersion = null;
    _syncNeeded   = false;
    _pulledMonths.clear();
    await _auth.signOut();
  }

  /* ─────────────────────────────────────────────────────
     エラーコード → 日本語
  ───────────────────────────────────────────────────── */

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
     push 系：LocalStorage → Firestore

     バッチ書き込み: データ + meta/info.version を同時更新
     → ローカルバージョンも更新するため、次回起動時は
       バージョン一致でスキップ対象になる
  ───────────────────────────────────────────────────── */

  function _userRef() {
    return _db.collection('users').doc(_uid);
  }

  function pushMonthData(year, month) {
    if (!_ready) return;
    const key = Storage.monthKey(year, month);
    clearTimeout(_monthTimers[key]);
    _monthTimers[key] = setTimeout(() => _doPushMonthData(year, month), 3000);
  }

  async function _doPushMonthData(year, month) {
    const key = Storage.monthKey(year, month);
    const md  = Storage.getMonthData(year, month);
    const ver = Date.now();
    try {
      const batch = _db.batch();
      batch.set(_userRef().collection('months').doc(key), md);
      batch.set(_userRef().collection('meta').doc('info'), { version: ver });
      await batch.commit();
      _cloudVersion = ver;
      _saveLocalVer(ver);
    } catch (e) {
      console.warn('[FirestoreDB] pushMonthData 失敗:', e.message);
    }
  }

  function pushProfile() {
    if (!_ready) return;
    clearTimeout(_profileTimer);
    _profileTimer = setTimeout(_doPushProfile, 5000);
  }

  async function _doPushProfile() {
    const ver = Date.now();
    try {
      const batch = _db.batch();
      batch.set(_userRef().collection('data').doc('profile'), {
        categories:  Storage.getCategories(),
        suggestions: Storage.getSuggestions()
      });
      batch.set(_userRef().collection('meta').doc('info'), { version: ver });
      await batch.commit();
      _cloudVersion = ver;
      _saveLocalVer(ver);
    } catch (e) {
      console.warn('[FirestoreDB] pushProfile 失敗:', e.message);
    }
  }

  /* ===== 公開 ===== */
  return {
    init, isReady,
    ensureMonth,
    submitAuth, resetPassword, switchMode, signOut,
    pushMonthData, pushProfile
  };
})();
