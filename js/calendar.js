/* =====================================================
   calendar.js — カレンダーコンポーネント
   ===================================================== */

const CalendarComponent = (() => {

  const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
  const DOW_CLASSES = ['sun', '', '', '', '', '', 'sat'];

  function render(containerId, year, month, markedDays) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const today    = new Date();
    const isToday  = (d) =>
      today.getFullYear() === year &&
      today.getMonth() + 1 === month &&
      today.getDate() === d;

    const totalDays = daysInMonth(year, month);
    const startDow  = firstDayOfWeek(year, month); // 0=日

    const markedSet = new Set(markedDays || []);

    // 曜日ヘッダー
    let html = '<div class="card"><div class="cal-grid">';
    DOW_LABELS.forEach((label, i) => {
      html += `<div class="cal-dow ${DOW_CLASSES[i]}">${label}</div>`;
    });

    // 月初の空白
    for (let i = 0; i < startDow; i++) {
      html += '<div class="cal-cell empty"></div>';
    }

    // 日付セル
    for (let d = 1; d <= totalDays; d++) {
      const dow       = dayOfWeek(year, month, d);
      const classes   = ['cal-cell'];
      if (dow === 0) classes.push('sun');
      if (dow === 6) classes.push('sat');
      if (isToday(d)) classes.push('today');
      if (markedSet.has(d)) classes.push('has-entry');

      const markHtml = markedSet.has(d)
        ? `<svg class="cal-mark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
             <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
           </svg>`
        : '<span class="cal-spacer"></span>';

      html += `<div class="${classes.join(' ')}">
        <span class="cal-num">${d}</span>
        ${markHtml}
      </div>`;
    }

    html += '</div></div>';
    el.innerHTML = html;
  }

  return { render };
})();
