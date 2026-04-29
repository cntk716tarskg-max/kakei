/* =====================================================
   firestore.js — Firebase Auth（メール/パスワード）+ Firestore 同期
   ・USE_FIRESTORE = false の間は完全に無効
   ・読み込みはログイン時1回のみ、30分キャッシュあり
   ・書き込みはデバウンスでまとめて送信
   ===================================================== */

const FirestoreDB = (() => {

  let _db    = null;
  let _uid   = null;
  let _ready = false;
  let _auth  = null;
  let _mode  = 'signin'; // 'signin' | 'signup'

  /* ─────────────────────────────────────────────────────
     キャッシュ設定
     ・SYNC_INTERVAL : この時間内に再ログインしても pull をスキップ
     ・SYNC_MONTHS   : pull する月数（当月 + 過去N-1ヶ月）
  ───────────────────────────────────────────────────── */
  const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30分
  const SYNC_MONTHS      = 13;              // 当月 + 12ヶ月前まで
  const CACHE_TS_KEY     = 'kakei_last_sync';

  function _getLastSync()  { return parseInt(localStorage.getItem(CACHE_TS_KEY) || '0'); }
  function _setLastSync()  { localStorage.setItem(CACHE_TS_KEY, Date.now().toString()); }
  function _clearLastSync(){ localStorage.removeItem(CACHE_TS_KEY); }
  function _needsSync()    { return Date.now() - _getLastSync() > SYNC_INTERVAL_MS; }

  // 直近 N ヶ月のキー配列を生成（例: ["2026-04","2026-03",...]）
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
     初期化
  ───────────────────────────────────────────────────── */

  function init() {
    if (!USE_FIRESTORE) return Promise.resolve();
    if (typeof firebase === 'undefined') {
      console.warn('[FirestoreDB] Firebase SDK が読み込まれていません。index.html の CDN コメントを解除してください。');
      return Promise.resolve();
    }
    if (firebase.apps.length === 0) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    _auth = firebase.auth();
    _bindAuthEnter();

    _auth.onAuthStateChanged(user => {
      if (user) {
        _onLogin(user);
      } else {
        _ready = false;
        _uid   = null;
        _db    = null;
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

    if (_needsSync()) {
      await pullAll();
    } else {
      console.log('[FirestoreDB] キャッシュ有効 — pull スキップ');
    }
  }

  function isReady() { return _ready; }

  /* ─────────────────────────────────────────────────────
     Auth オーバーレイ 表示 / 非表示
  ───────────────────────────────────────────────────── */

  function _showOverlay() {
    document.getElementById('auth-overlay')?.classList.remove('hidden');
    _setMode('signin');
  }

  function _hideOverlay() {
    document.getElementById('auth-overlay')?.classList.add('hidden');
  }

  /* ─────────────────────────────────────────────────────
     タブ切替・メッセージ表示
  ───────────────────────────────────────────────────── */

  function _setMode(mode) {
    _mode = mode;
    document.querySelectorAll('.auth-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.mode === mode)
    );
    const submitBtn = document.getElementById('auth-submit-btn');
    if (submitBtn) submitBtn.textContent = mode === 'signin' ? 'ログイン' : '新規登録';
    document.getElementById('auth-reset-btn')?.classList.toggle('hidden', mode !== 'signin');
    _clearMsg();
  }

  function switchMode(mode) { _setMode(mode); }

  function _setError(msg) {
    const err = document.getElementById('auth-error');
    const suc = document.getElementById('auth-success');
    if (err) { err.textContent = msg; err.classList.remove('hidden'); }
    suc?.classList.add('hidden');
  }

  function _setSuccess(msg) {
    const suc = document.getElementById('auth-success');
    const err = document.getElementById('auth-error');
    if (suc) { suc.textContent = msg; suc.classList.remove('hidden'); }
    err?.classList.add('hidden');
  }

  function _clearMsg() {
    ['auth-error', 'auth-success'].forEach(id =>
      document.getElementById(id)?.classList.add('hidden')
    );
  }

  /* ─────────────────────────────────────────────────────
     Enter キーナビゲーション（一度だけバインド）
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
     ログアウト（キャッシュもクリア）
  ───────────────────────────────────────────────────── */

  async function signOut() {
    if (!_auth) return;
    _clearLastSync();
    await _auth.signOut();
  }

  /* ─────────────────────────────────────────────────────
     エラーコード → 日本語メッセージ
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
     push 系：LocalStorage → Firestore（デバウンスあり）

     ・pushMonthData : 3秒間隔でまとめて書き込み（月単位）
     ・pushProfile   : 5秒間隔でまとめて書き込み
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
    try {
      await _userRef().collection('months').doc(key).set(md);
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
    try {
      await _userRef().collection('data').doc('profile').set({
        categories:  Storage.getCategories(),
        suggestions: Storage.getSuggestions()
      });
    } catch (e) {
      console.warn('[FirestoreDB] pushProfile 失敗:', e.message);
    }
  }

  /* ─────────────────────────────────────────────────────
     pull 系：Firestore → LocalStorage

     ・ログイン時に1回だけ実行（30分キャッシュで制御）
     ・取得するのは直近 SYNC_MONTHS ヶ月 + profile のみ
     ・読み込み数 = SYNC_MONTHS(13) + 1(profile) = 最大14件/回
  ───────────────────────────────────────────────────── */

  async function pullAll() {
    if (!_ready) return;
    try {
      const local = Storage.loadAll();
      let changed = false;

      // プロフィール（カテゴリ・入力候補）— 1 read
      const profSnap = await _userRef().collection('data').doc('profile').get();
      if (profSnap.exists) {
        const prof = profSnap.data();
        if (prof.categories)  { local.categories  = prof.categories;  changed = true; }
        if (prof.suggestions) { local.suggestions = prof.suggestions; changed = true; }
      }

      // 月データ — 最大 SYNC_MONTHS reads（並列取得）
      const keys   = _recentMonthKeys(SYNC_MONTHS);
      const snaps  = await Promise.all(
        keys.map(k => _userRef().collection('months').doc(k).get())
      );
      snaps.forEach(snap => {
        if (snap.exists) { local.months[snap.id] = snap.data(); changed = true; }
      });

      if (changed) Storage.saveAll(local);
      _setLastSync();

      if (typeof App !== 'undefined') App.refresh();
      console.log(`[FirestoreDB] pullAll 完了（${snaps.filter(s => s.exists).length + (profSnap.exists ? 1 : 0)} 件読み込み）`);
    } catch (e) {
      console.warn('[FirestoreDB] pullAll 失敗:', e.message);
    }
  }

  /* ===== 公開 ===== */
  return {
    init, isReady,
    submitAuth, resetPassword, switchMode, signOut,
    pushMonthData, pushProfile, pullAll
  };
})();
