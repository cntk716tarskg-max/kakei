/* =====================================================
   firestore.js — Firebase Auth（メール/パスワード）+ Firestore 同期
   ・USE_FIRESTORE = false の間は完全に無効
   ===================================================== */

const FirestoreDB = (() => {

  let _db    = null;
  let _uid   = null;
  let _ready = false;
  let _auth  = null;
  let _mode  = 'signin'; // 'signin' | 'signup'

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

    // ログイン状態を監視（変化のたびに呼ばれる）
    _auth.onAuthStateChanged(user => {
      if (user) {
        _onLogin(user);
      } else {
        _ready = false;
        _uid   = null;
        _db    = null;
        const logoutBtn = document.getElementById('auth-logout-btn');
        if (logoutBtn) logoutBtn.classList.add('hidden');
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
    const logoutBtn = document.getElementById('auth-logout-btn');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    await pullAll();
  }

  function isReady() { return _ready; }

  /* ─────────────────────────────────────────────────────
     Auth オーバーレイ 表示 / 非表示
  ───────────────────────────────────────────────────── */

  function _showOverlay() {
    const el = document.getElementById('auth-overlay');
    if (el) el.classList.remove('hidden');
    _setMode('signin');
  }

  function _hideOverlay() {
    const el = document.getElementById('auth-overlay');
    if (el) el.classList.add('hidden');
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
    const resetBtn = document.getElementById('auth-reset-btn');
    if (resetBtn) resetBtn.classList.toggle('hidden', mode !== 'signin');
    _clearMsg();
  }

  function switchMode(mode) { _setMode(mode); }

  function _setError(msg) {
    const err = document.getElementById('auth-error');
    const suc = document.getElementById('auth-success');
    if (err) { err.textContent = msg; err.classList.remove('hidden'); }
    if (suc) suc.classList.add('hidden');
  }

  function _setSuccess(msg) {
    const err = document.getElementById('auth-error');
    const suc = document.getElementById('auth-success');
    if (suc) { suc.textContent = msg; suc.classList.remove('hidden'); }
    if (err) err.classList.add('hidden');
  }

  function _clearMsg() {
    ['auth-error', 'auth-success'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
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
      // 成功 → onAuthStateChanged が _onLogin を呼ぶ
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
     push 系：LocalStorage → Firestore（fire-and-forget）
  ───────────────────────────────────────────────────── */

  function _userRef() {
    return _db.collection('users').doc(_uid);
  }

  async function pushMonthData(year, month) {
    if (!_ready) return;
    const key = Storage.monthKey(year, month);
    const md  = Storage.getMonthData(year, month);
    try {
      await _userRef().collection('months').doc(key).set(md);
    } catch (e) {
      console.warn('[FirestoreDB] pushMonthData 失敗:', e.message);
    }
  }

  async function pushProfile() {
    if (!_ready) return;
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
     pull 系：Firestore → LocalStorage（ログイン直後のみ）
  ───────────────────────────────────────────────────── */

  async function pullAll() {
    if (!_ready) return;
    try {
      let changed = false;

      const profSnap = await _userRef().collection('data').doc('profile').get();
      if (profSnap.exists) {
        const prof  = profSnap.data();
        const local = Storage.loadAll();
        if (prof.categories)  { local.categories  = prof.categories;  changed = true; }
        if (prof.suggestions) { local.suggestions = prof.suggestions; changed = true; }
        if (changed) Storage.saveAll(local);
      }

      const monthsSnap = await _userRef().collection('months').get();
      if (!monthsSnap.empty) {
        const local = Storage.loadAll();
        monthsSnap.forEach(doc => { local.months[doc.id] = doc.data(); });
        Storage.saveAll(local);
        changed = true;
      }

      if (changed && typeof App !== 'undefined') App.refresh();
      console.log('[FirestoreDB] pullAll 完了');
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
