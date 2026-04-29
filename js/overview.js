/* =====================================================
   overview.js — 全体管理ページ
   ===================================================== */

const Overview = (() => {

  /* ===== メインレンダリング ===== */
  function render(year, month) {
    const md   = Storage.getMonthData(year, month);
    const cats = Storage.getCategories();
    const computed = _compute(md, cats);

    _renderCalendar(year, month, md.entries);
    _renderSummary(computed);
    _renderCategories(year, month, cats, md, computed);
    _renderFixed(year, month, md);    // 固定費を先に
    _renderIncome(year, month, md);   // 収入を最後
  }

  /* ===== 計算 ===== */
  function _compute(md, cats) {
    const incomeTotal = md.income.reduce((s, i) => s + i.amount, 0);
    const fixedTotal  = md.fixedCosts.reduce((s, f) => s + f.amount, 0);

    // 区分別予算合計
    const catBudgetTotal = cats.reduce((s, c) => s + (md.budgets[c.id] || 0), 0);

    // 予算合計 = 区分別合計 + 固定費
    const budgetTotal  = catBudgetTotal + fixedTotal;
    // 支出合計 = 明細合計 + 固定費
    const entriesTotal = md.entries.reduce((s, e) => s + e.amount, 0);
    const expenseTotal = entriesTotal + fixedTotal;
    const remaining    = budgetTotal - expenseTotal;
    const incomeDiff   = incomeTotal - budgetTotal;

    // 区分別
    const catStats = cats.map(c => {
      const budget  = md.budgets[c.id] || 0;
      const expense = md.entries
        .filter(e => e.categoryId === c.id)
        .reduce((s, e) => s + e.amount, 0);
      return { id: c.id, name: c.name, budget, expense, remaining: budget - expense };
    });

    return {
      incomeTotal, fixedTotal, catBudgetTotal,
      budgetTotal, expenseTotal, remaining, incomeDiff,
      catStats
    };
  }

  /* ===== カレンダー ===== */
  function _renderCalendar(year, month, entries) {
    const marked = [...new Set(entries.map(e => e.day))];
    CalendarComponent.render('calendar-section', year, month, marked);
  }

  /* ===== サマリー（横並びバー） ===== */
  function _renderSummary(c) {
    const remClass    = c.remaining  < 0 ? 'accent-negative' : 'accent-positive';
    const budgetClass = c.budgetTotal > c.incomeTotal ? 'accent-budget-over' : '';

    document.getElementById('summary-section').innerHTML = `
      <div class="summary-bar card">
        <div class="sbar-item">
          <div class="sbar-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
          </div>
          <span class="sbar-label">収入</span>
          <span class="sbar-value">${formatCurrency(c.incomeTotal)}</span>
        </div>
        <div class="sbar-item ${budgetClass}">
          <div class="sbar-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-7-2h2V7h-4v2h2z"/></svg>
          </div>
          <span class="sbar-label">予算</span>
          <span class="sbar-value">${formatCurrency(c.budgetTotal)}</span>
        </div>
        <div class="sbar-item accent-expense">
          <div class="sbar-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>
          </div>
          <span class="sbar-label">支出</span>
          <span class="sbar-value">${formatCurrency(c.expenseTotal)}</span>
        </div>
        <div class="sbar-item ${remClass}">
          <div class="sbar-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z"/></svg>
          </div>
          <span class="sbar-label">残額</span>
          <span class="sbar-value">${formatCurrency(c.remaining)}</span>
        </div>
      </div>
    `;
  }

  /* ===== 区分テーブル ===== */
  function _renderCategories(year, month, cats, md, computed) {
    const el = document.getElementById('category-section');

    const rows = computed.catStats.map(cs => {
      const pct  = cs.budget > 0 ? Math.min(100, (cs.expense / cs.budget) * 100) : 0;
      const over = cs.remaining < 0;
      return `
        <tr>
          <td>
            <div class="cat-name-cell">
              <span class="cat-name-text">${escHtml(cs.name)}</span>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill ${over ? 'over' : ''}" style="width:${pct}%"></div>
            </div>
          </td>
          <td>
            <button class="cat-budget-btn"
              onclick="Settings.openBudgetEdit('${cs.id}', ${year}, ${month})"
              title="予算を編集">
              ${formatCurrency(cs.budget)}
            </button>
          </td>
          <td class="col-expense">${formatCurrency(cs.expense)}</td>
          <td class="col-remain ${over ? 'negative' : 'positive'}">${formatCurrency(cs.remaining)}</td>
        </tr>
      `;
    }).join('');

    const totBudget  = computed.catStats.reduce((s, c) => s + c.budget, 0);
    const totExpense = computed.catStats.reduce((s, c) => s + c.expense, 0);
    const totRemain  = totBudget - totExpense;

    const emptyState = cats.length === 0 ? `
      <tr><td colspan="4">
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
          区分を追加してください
        </div>
      </td></tr>` : rows;

    el.innerHTML = `
      <div class="card">
        <div class="card-title">
          <div class="card-title-left">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
            区分別管理
          </div>
          <button class="btn-ghost" onclick="Settings.openCategoryManager(${year}, ${month})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
            </svg>
            区分編集
          </button>
        </div>
        <table class="cat-table">
          <thead>
            <tr>
              <th style="text-align:left">区分</th>
              <th>予算</th>
              <th>支出</th>
              <th>残額</th>
            </tr>
          </thead>
          <tbody>${emptyState}</tbody>
          ${cats.length > 0 ? `
          <tfoot>
            <tr>
              <td>合計</td>
              <td>${formatCurrency(totBudget)}</td>
              <td>${formatCurrency(totExpense)}</td>
              <td class="${totRemain < 0 ? 'text-danger' : 'text-success'}">${formatCurrency(totRemain)}</td>
            </tr>
          </tfoot>` : ''}
        </table>
      </div>
    `;
  }

  /* ===== 収入セクション ===== */
  function _renderIncome(year, month, md) {
    const el    = document.getElementById('income-section');
    const total = md.income.reduce((s, i) => s + i.amount, 0);

    const rows = md.income.map(i => `
      <div class="section-list-item">
        <span class="sli-label">${escHtml(i.label)}</span>
        <span class="sli-amount">${formatCurrency(i.amount)}</span>
        <button class="btn-icon-sm" onclick="Settings.openIncomeEdit('${i.id}', ${year}, ${month})" title="編集">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="btn-icon-sm btn-danger-ghost" onclick="Settings.deleteIncome('${i.id}', ${year}, ${month})" title="削除">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    `).join('');

    const empty = md.income.length === 0
      ? '<div class="empty-state" style="padding:16px 0">収入を追加してください</div>'
      : rows;

    el.innerHTML = `
      <div class="card">
        <div class="card-title">
          <div class="card-title-left">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
            収入
          </div>
          <button class="btn-ghost" onclick="Settings.openIncomeAdd(${year}, ${month})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            追加
          </button>
        </div>
        ${empty}
        <div class="section-total">
          <span class="section-total-label">合計</span>
          <span class="section-total-value">${formatCurrency(total)}</span>
        </div>
      </div>
    `;
  }

  /* ===== 固定費セクション ===== */
  function _renderFixed(year, month, md) {
    const el    = document.getElementById('fixed-section');
    const total = md.fixedCosts.reduce((s, f) => s + f.amount, 0);

    const rows = md.fixedCosts.map(f => `
      <div class="section-list-item">
        <span class="sli-label">${escHtml(f.label)}</span>
        <span class="sli-amount">${formatCurrency(f.amount)}</span>
        <button class="btn-icon-sm" onclick="Settings.openFixedEdit('${f.id}', ${year}, ${month})" title="編集">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="btn-icon-sm btn-danger-ghost" onclick="Settings.deleteFixed('${f.id}', ${year}, ${month})" title="削除">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    `).join('');

    const empty = md.fixedCosts.length === 0
      ? '<div class="empty-state" style="padding:16px 0">固定費を追加してください</div>'
      : rows;

    el.innerHTML = `
      <div class="card">
        <div class="card-title">
          <div class="card-title-left">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
            固定費
          </div>
          <button class="btn-ghost" onclick="Settings.openFixedAdd(${year}, ${month})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            追加
          </button>
        </div>
        ${empty}
        <div class="section-total">
          <span class="section-total-label">合計（予算・支出に反映）</span>
          <span class="section-total-value">${formatCurrency(total)}</span>
        </div>
      </div>
    `;
  }

  return { render };
})();
