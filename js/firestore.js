/* =====================================================
   firestore.js — Firebase Auth + Firestore 同期

   【設計方針】
   Pull: ログイン時に必ずprofile + 表示月を取得（常に最新）
         月切替時は未取得の月を都度取得（セッション内キャッシュ）
   Push: カテゴリ変更 → 即送信
         月データ    → 3秒デバウンス
         入力候補    → 5秒デバウンス
         バックグラウンド移行時 → 保留データを即フラッシュ
   ===================================================== */

const FirestoreDB = (() => {

  let _db   = null;
  let _uid  = null;
  let _ready = false;
  let _auth  = null;
  let _mode  = 'signin';

  // セッション内で取得済みの月キー（同一セッションでの重複fetch防止）
  const _pulledMonths = new Set();

  /* ─────────────────────────────────────────────────────
     デバウンスタイマー
  ───────────────────────────────────────────────────── */

  const _monthTimers = {};
  let   _suggTimer   = null;

  /* ─────────────────────────────────────────────────────
     バックグラウンド移行時フラッシュ
  ───────────────────────────────────────────────────── */

  function _flushPending() {
    if (!_ready) return;
    Object.keys(_monthTimers).forEach(key => {
      clearTimeout(_monthTimers[key]);
      delete _monthTimers[key];
      const [y, m] = key.split('-').map(Number);
      _doPushMonthData(y, m).catch(() => {});
    });
    if (_suggTimer !== null) {
      clearTimeout(_suggTimer);
      _suggTimer = null;
      _doPushSuggestions().catch(() => {});
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') _flushPending();
  });
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
        _ready = false;
        _uid   = null;
        _db    = null;
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

    // ログイン時は常にprofileと表示月を取得（常に最新を保証）
    try { await _pullProfile(); }
    catch (e) { console.warn('[FirestoreDB] profile取得失敗:', e.message); }

    const s = typeof App !== 'undefined' ? App.getState() : null;
    if (s) {
      try { await _pullMonth(s.year, s.month); }
      catch (e) { console.warn('[FirestoreDB] 月データ取得失敗:', e.message); }
    }

    if (typeof App !== 'undefined') App.refresh();
    console.log('[FirestoreDB] ログイン同期完了');
  }

  function isReady() { return _ready; }

  /* ─────────────────────────────────────────────────────
     月切替時（未取得の月のみfetch）
  ───────────────────────────────────────────────────── */

  async function ensureMonth(year, month) {
    if (!_ready) return;
    const key = Storage.monthKey(year, month);
    if (_pulledMonths.has(key)) return;
    try {
      await _pullMonth(year, month);
      if (typeof App !== 'undefined') App.refresh();
    } catch (e) {
      console.warn('[FirestoreDB] ensureMonth失敗:', e.message);
    }
  }

  /* ─────────────────────────────────────────────────────
     pull ヘルパー
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
    _pulledMonths.add(key); // 先に追加して重複fetch防止
    try {
      const snap = await _userRef().collection('months').doc(key).get();
      if (snap.exists) {
        const local = Storage.loadAll();
        local.months[key] = snap.data();
        Storage.saveAll(local);
      }
    } catch (e) {
      _pulledMonths.delete(key); // エラー時はリトライ可能に
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
     ログイン / 新規登録 / リセット / ログアウト
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
    _flushPending();
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
     push 系

     pushCategories : 即送信（区分追加・削除は即反映）
     pushMonthData  : 3秒デバウンス
     pushSuggestions: 5秒デバウンス（入力候補は頻繁に更新）
  ───────────────────────────────────────────────────── */

  function _userRef() { return _db.collection('users').doc(_uid); }

  // カテゴリ変更 → 即送信
  function pushCategories() {
    if (!_ready) return;
    clearTimeout(_suggTimer); // 入力候補の保留もまとめてキャンセル
    _doPushProfile().catch(e => console.warn('[FirestoreDB] pushCategories失敗:', e.message));
  }

  // 入力候補更新 → 5秒デバウンス
  function pushSuggestions() {
    if (!_ready) return;
    clearTimeout(_suggTimer);
    _suggTimer = setTimeout(() => {
      _suggTimer = null;
      _doPushSuggestions().catch(() => {});
    }, 5000);
  }

  async function _doPushProfile() {
    await _userRef().collection('data').doc('profile').set({
      categories:  Storage.getCategories(),
      suggestions: Storage.getSuggestions()
    });
  }

  async function _doPushSuggestions() {
    await _userRef().collection('data').doc('profile').set({
      categories:  Storage.getCategories(),
      suggestions: Storage.getSuggestions()
    });
  }

  // 月データ → 3秒デバウンス
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
    await _userRef().collection('months').doc(key).set(md);
  }

  /* ===== 公開 ===== */
  return {
    init, isReady,
    ensureMonth,
    submitAuth, resetPassword, switchMode, signOut,
    pushCategories, pushSuggestions, pushMonthData
  };
})();
