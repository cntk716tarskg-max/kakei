/* =====================================================
   utils.js — 共通ユーティリティ・Modalシステム
   ===================================================== */

/* ---------- 通貨フォーマット ---------- */

function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(Number(amount))) return '¥0';
  return '¥' + Math.round(Number(amount)).toLocaleString('ja-JP');
}

/* ---------- Modal ---------- */

const Modal = (() => {
  let _overlay, _box, _title, _body, _closeBtn;

  function _init() {
    _overlay  = document.getElementById('modal-overlay');
    _box      = document.getElementById('modal-box');
    _title    = document.getElementById('modal-title');
    _body     = document.getElementById('modal-body');
    _closeBtn = document.getElementById('modal-close-btn');

    _overlay.addEventListener('click', close);
    _closeBtn.addEventListener('click', close);

    // ESC キーで閉じる
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
    });
  }

  function open(title, bodyHTML) {
    _title.textContent = title;
    _body.innerHTML    = bodyHTML;
    _overlay.classList.remove('hidden');
    _box.classList.remove('hidden');
    // 最初の入力にフォーカス
    setTimeout(() => {
      const first = _body.querySelector('input, select, textarea');
      if (first) first.focus();
    }, 50);
  }

  function close() {
    _overlay.classList.add('hidden');
    _box.classList.add('hidden');
    _body.innerHTML = '';
  }

  function getBody() { return _body; }

  return { _init, open, close, getBody };
})();

/* ---------- 確認ダイアログ (簡易) ---------- */
function confirmDialog(message) {
  return window.confirm(message);
}

/* ---------- 日付ユーティリティ ---------- */

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function dayOfWeek(year, month, day) {
  return new Date(year, month - 1, day).getDay();
}

function firstDayOfWeek(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

function toFullDate(year, month, day) {
  return `${year}/${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
}

/* ---------- HTML エスケープ ---------- */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
