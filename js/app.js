/* =====================================================
   app.js — アプリケーション初期化・ルーティング・月管理
   ===================================================== */

const App = (() => {

  /* ----- グローバル状態 ----- */
  const state = {
    year:  new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    page:  'overview'
  };

  /* ----- 初期化 ----- */
  function init() {
    Modal._init();
    _setupNav();
    _setupMonthNav();
    _refresh();
    if (typeof FirestoreDB !== 'undefined') {
      FirestoreDB.init().catch(() => {});
    }
  }

  /* ----- ページナビゲーション ----- */
  function _setupNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });
  }

  function navigateTo(page) {
    state.page = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(btn =>
      btn.classList.toggle('active', btn.dataset.page === page)
    );
    _renderPage();
  }

  /* ----- 月ナビゲーション ----- */
  function _setupMonthNav() {
    document.getElementById('btn-prev-month').addEventListener('click', () => {
      if (state.month === 1) { state.month = 12; state.year--; }
      else state.month--;
      _refresh();
    });
    document.getElementById('btn-next-month').addEventListener('click', () => {
      if (state.month === 12) { state.month = 1; state.year++; }
      else state.month++;
      _refresh();
    });
  }

  /* ----- 全体再描画 ----- */
  function _refresh() {
    _updateHeader();
    _renderPage();
    // 表示月のデータがクラウドと同期されているか確認（必要なときのみ1 read）
    if (typeof FirestoreDB !== 'undefined' && FirestoreDB.isReady()) {
      FirestoreDB.ensureMonth(state.year, state.month).catch(() => {});
    }
  }

  function _updateHeader() {
    document.getElementById('header-month-label').textContent =
      state.year + '年' + state.month + '月';
    const now = new Date();
    const isCurrentMonth = state.year  === now.getFullYear()
                        && state.month === now.getMonth() + 1;
    const todayBtn = document.getElementById('btn-today-month');
    if (todayBtn) todayBtn.classList.toggle('hidden', isCurrentMonth);
  }

  function goToCurrentMonth() {
    const now = new Date();
    state.year  = now.getFullYear();
    state.month = now.getMonth() + 1;
    _refresh();
  }

  function _renderPage() {
    const { year, month, page } = state;
    if (page === 'overview') Overview.render(year, month);
    if (page === 'detail')   Detail.render(year, month);
    if (page === 'print')    Print.render(year, month);
  }

  /* ----- 外部から呼ぶ再描画（データ変更後） ----- */
  function refresh() { _refresh(); }

  function getState() { return state; }

  /* ----- DOMContentLoaded で起動 ----- */
  document.addEventListener('DOMContentLoaded', init);

  return { getState, navigateTo, refresh, goToCurrentMonth };
})();
