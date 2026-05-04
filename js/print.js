/* =====================================================
   print.js — 印刷プレビュー & 印刷実行
   A4 2ページ：
     1ページ目 = カレンダー（上部）＋全体管理
     2ページ目 = 明細（1〜3列自動）
   ===================================================== */

const Print = (() => {

  let _sortOrder = 'date'; // 'date' | 'item' | 'category'

  function render(year, month) {
    _renderActionsBar(year, month);
    _renderPreview(year, month);
  }

  function setSortOrder(order, year, month) {
    _sortOrder = order;
    render(year, month);
  }

  /* ===== アクションボタン ===== */
  function _renderActionsBar(year, month) {
    const sorts = [
      { key: 'date',     label: '日付順' },
      { key: 'item',     label: '項目順' },
      { key: 'category', label: '区分順' },
    ];
    const sortBtns = sorts.map(s =>
      `<button class="btn-sort${_sortOrder === s.key ? ' active' : ''}"
               onclick="Print.setSortOrder('${s.key}', ${year}, ${month})">${s.label}</button>`
    ).join('');

    document.getElementById('print-actions-bar').innerHTML = `
      <div class="print-sort-group">${sortBtns}</div>
      <button class="btn-primary" onclick="window.print()">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
        </svg>
        印刷する
      </button>
    `;
  }

  /* ===== プレビュー全体 ===== */
  function _renderPreview(year, month) {
    const el   = document.getElementById('print-preview');
    const md   = Storage.getMonthData(year, month);
    const cats = Storage.getCategories();
    el.innerHTML = _buildPage1(year, month, md, cats) + _buildPage2(year, month, md, cats);
  }

  /* =====================================================
     インラインカレンダー HTML（印刷用）
     ===================================================== */
  function _buildPrintCalendar(year, month, markedDays) {
    const markedSet = new Set(markedDays);
    const totalDays = new Date(year, month, 0).getDate();
    const startDow  = new Date(year, month - 1, 1).getDay();
    const DOW        = ['日','月','火','水','木','金','土'];
    const DOW_COLORS = ['#DC2626','#444','#444','#444','#444','#444','#2563EB'];

    // 共通セルスタイル（全セルで同一の罫線を保証）
    const BORDER  = '1px solid #EDE8E2';
    const TH_STYLE = (color) =>
      `text-align:center;padding:5px 2px;font-size:8pt;font-weight:800;` +
      `color:${color};background:#FFF4EB;` +
      `border:${BORDER};border-bottom:2px solid #F4A96C`;
    const TD_EMPTY =
      `border:${BORDER};padding:8px 2px;background:#FAFAFA`;
    const TD_DAY  = (bg) =>
      `border:${BORDER};padding:5px 2px 4px;background:${bg};text-align:center`;

    // ウォレットアイコン（マーク有り）
    const WALLET_SVG =
      `<svg width="9" height="9" viewBox="0 0 24 24" fill="#F4A96C" ` +
      `style="display:block;margin:2px auto 0">` +
      `<path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5` +
      `c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8` +
      `c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5` +
      `s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`;
    const SPACER = `<div style="height:11px"></div>`;

    // ── テーブル開始 ──────────────────────────
    let html =
      `<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt">` +
      `<thead><tr>`;

    // 曜日ヘッダー（7列）
    DOW.forEach((d, i) => {
      html += `<th style="${TH_STYLE(DOW_COLORS[i])}">${d}</th>`;
    });
    html += `</tr></thead><tbody><tr>`;

    // 月初の空白セル
    for (let i = 0; i < startDow; i++) {
      html += `<td style="${TD_EMPTY}"></td>`;
    }

    // 日付セル（日曜始まりで行を折り返す）
    for (let d = 1; d <= totalDays; d++) {
      const dow    = new Date(year, month - 1, d).getDay();
      if (dow === 0 && d > 1) html += `</tr><tr>`; // 新週

      const marked = markedSet.has(d);
      const bg     = marked ? '#FFF4EB' : '#FFFFFF';
      html +=
        `<td style="${TD_DAY(bg)}">` +
        `<div style="color:${DOW_COLORS[dow]};font-weight:700;line-height:1.3">${d}</div>` +
        (marked ? WALLET_SVG : SPACER) +
        `</td>`;
    }

    // 末尾の空白セル（行を7列に揃える）
    const lastDow = new Date(year, month - 1, totalDays).getDay();
    for (let i = lastDow + 1; i <= 6; i++) {
      html += `<td style="${TD_EMPTY}"></td>`;
    }

    html += `</tr></tbody></table>`;
    return html;
  }

  /* =====================================================
     1ページ目：カレンダー上部 → サマリー → 区分/固定費/収入
     A4縦（210×297mm、マージン考慮コンテンツ 170×261mm）
     ===================================================== */
  function _buildPage1(year, month, md, cats) {
    /* ---- 数値計算 ---- */
    const incomeTotal    = md.income.reduce((s, i) => s + i.amount, 0);
    const fixedTotal     = md.fixedCosts.reduce((s, f) => s + f.amount, 0);
    const catBudget      = cats.reduce((s, c) => s + (md.budgets[c.id] || 0), 0);
    const budgetTotal    = catBudget;                  // 固定費を除く
    const entriesSum     = md.entries.reduce((s, e) => s + e.amount, 0);
    const expenseNoFixed = entriesSum;                 // 支出（固定費を除く）
    const expenseTotal   = entriesSum + fixedTotal;    // 支出（固定費を含む）
    const remaining      = budgetTotal - expenseNoFixed;
    const markedDays     = [...new Set(md.entries.map(e => e.day))];

    /* ---- 予算超過カラー ---- */
    const budgetColor  = budgetTotal > incomeTotal ? '#DC2626' : '#1C1917';
    const remainColor  = remaining   < 0           ? '#DC2626' : '#16A34A';

    /* ---- 区分テーブル行 ---- */
    let catBudgetSum = 0, catExpenseSum = 0;
    const catRows = cats.map(c => {
      const b  = md.budgets[c.id] || 0;
      const ex = md.entries.filter(e => e.categoryId === c.id).reduce((s, e) => s + e.amount, 0);
      const r  = b - ex;
      catBudgetSum  += b;
      catExpenseSum += ex;
      return `<tr>
        <td>${escHtml(c.name)}</td>
        <td style="text-align:right">${formatCurrency(b)}</td>
        <td style="text-align:right">${formatCurrency(ex)}</td>
        <td style="text-align:right;color:${r < 0 ? '#DC2626' : '#16A34A'}">${formatCurrency(r)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" style="color:#78716C;font-size:11px">区分なし</td></tr>';
    const catRemainSum = catBudgetSum - catExpenseSum;

    /* ---- 収入・固定費行 ---- */
    const incomeRows = md.income.map(i =>
      `<tr><td>${escHtml(i.label)}</td><td style="text-align:right">${formatCurrency(i.amount)}</td></tr>`
    ).join('') || `<tr><td colspan="2" style="color:#78716C;font-size:11px">なし</td></tr>`;

    const fixedRows  = md.fixedCosts.map(f =>
      `<tr><td>${escHtml(f.label)}</td><td style="text-align:right">${formatCurrency(f.amount)}</td></tr>`
    ).join('') || `<tr><td colspan="2" style="color:#78716C;font-size:11px">なし</td></tr>`;

    /* ---- HTML 組み立て ---- */
    return `
      <div class="print-page">
        <div class="print-page-label">📄 1ページ目（全体管理）</div>

        <!-- タイトル行 -->
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
          <div class="print-title">Kakei+</div>
          <div class="print-subtitle" style="margin-bottom:0">${year}年${month}月 家計簿レポート</div>
        </div>

        <!-- ① カレンダー（上部・全幅） -->
        <div style="margin-bottom:12px">
          ${_buildPrintCalendar(year, month, markedDays)}
          <p style="font-size:8pt;color:#78716C;margin-top:3px;text-align:right">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="#F4A96C" style="vertical-align:middle;margin-right:2px">
              <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
            のある日に入力があります
          </p>
        </div>

        <!-- ② サマリー行 -->
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:12px">
          <div class="print-summary-item">
            <div class="ps-label">収入合計</div>
            <div class="ps-value">${formatCurrency(incomeTotal)}</div>
          </div>
          <div class="print-summary-item">
            <div class="ps-label">予算合計</div>
            <div class="ps-value" style="color:${budgetColor}">${formatCurrency(budgetTotal)}</div>
          </div>
          <div class="print-summary-item" style="background:#FFF4EB">
            <div class="ps-label" style="color:#D97B3A">支出（固定除）</div>
            <div class="ps-value" style="color:#D97B3A">${formatCurrency(expenseNoFixed)}</div>
          </div>
          <div class="print-summary-item" style="background:#FFF4EB">
            <div class="ps-label" style="color:#D97B3A">支出合計</div>
            <div class="ps-value" style="color:#D97B3A">${formatCurrency(expenseTotal)}</div>
          </div>
          <div class="print-summary-item">
            <div class="ps-label">残額</div>
            <div class="ps-value" style="color:${remainColor}">${formatCurrency(remaining)}</div>
          </div>
        </div>

        <!-- ③ 区分テーブル + 固定費/収入（2カラム） -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start">

          <!-- 左：区分別管理 -->
          <div>
            <div class="print-section-title" style="margin-top:0">区分別管理</div>
            <table class="print-cat-table">
              <thead>
                <tr>
                  <th style="text-align:left">区分</th>
                  <th>予算</th><th>支出</th><th>残額</th>
                </tr>
              </thead>
              <tbody>${catRows}</tbody>
              <tfoot>
                <tr>
                  <td>合計</td>
                  <td style="text-align:right">${formatCurrency(catBudgetSum)}</td>
                  <td style="text-align:right">${formatCurrency(catExpenseSum)}</td>
                  <td style="text-align:right;color:${catRemainSum < 0 ? '#DC2626' : '#16A34A'}">${formatCurrency(catRemainSum)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <!-- 右：固定費 + 収入 -->
          <div>
            <div class="print-section-title" style="margin-top:0">固定費（予算・支出に反映）</div>
            <table class="print-list-table">
              <tbody>${fixedRows}</tbody>
              <tfoot><tr>
                <td style="font-weight:700">合計</td>
                <td style="text-align:right;font-weight:700">${formatCurrency(fixedTotal)}</td>
              </tr></tfoot>
            </table>

            <div class="print-section-title">収入</div>
            <table class="print-list-table">
              <tbody>${incomeRows}</tbody>
              <tfoot><tr>
                <td style="font-weight:700">合計</td>
                <td style="text-align:right;font-weight:700">${formatCurrency(incomeTotal)}</td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /* =====================================================
     2ページ目：明細（1〜3列自動）
     ===================================================== */
  function _buildPage2(year, month, md, cats) {
    const catMap = Object.fromEntries(cats.map(c => [c.id, c.name]));

    let sorted;
    if (_sortOrder === 'item') {
      sorted = [...md.entries].sort((a, b) =>
        a.item.localeCompare(b.item, 'ja') || a.day - b.day
      );
    } else if (_sortOrder === 'category') {
      sorted = [...md.entries].sort((a, b) => {
        const ca = catMap[a.categoryId] || '￿';
        const cb = catMap[b.categoryId] || '￿';
        return ca.localeCompare(cb, 'ja') || a.day - b.day;
      });
    } else {
      sorted = [...md.entries].sort((a, b) => a.day - b.day);
    }

    const total  = sorted.reduce((s, e) => s + e.amount, 0);
    const count  = sorted.length;

    const numCols = count <= 30 ? 1 : count <= 60 ? 2 : 3;

    return `
      <div class="print-page">
        <div class="print-page-label">📄 2ページ目（明細）</div>

        <div class="print-title">Kakei+ 明細</div>
        <div class="print-subtitle">${year}年${month}月 / ${count}件${numCols > 1 ? ` ／ ${numCols}列表示` : ''}</div>

        ${_buildColumnarEntries(sorted, catMap, numCols)}
      </div>
    `;
  }

  /* ===== 多段組エントリー ===== */
  function _buildColumnarEntries(sorted, catMap, numCols) {
    const total = sorted.reduce((s, e) => s + e.amount, 0);

    if (numCols === 1) {
      return _buildEntryTable(sorted, catMap, true) +
        `<div style="text-align:right;font-weight:700;font-size:13px;
                     margin-top:8px;padding-top:6px;border-top:2px solid #EDE8E2">
          合計 ${formatCurrency(total)}
        </div>`;
    }

    const perCol = Math.ceil(sorted.length / numCols);
    const cols   = [];
    for (let i = 0; i < numCols; i++) {
      cols.push(sorted.slice(i * perCol, (i + 1) * perCol));
    }

    const gap = numCols === 3 ? '8px' : '14px';
    const tables = cols.map(col =>
      `<div>${_buildEntryTable(col, catMap, numCols === 1, numCols === 3 ? '10px' : '11px')}</div>`
    ).join('');

    return `
      <div style="display:grid;grid-template-columns:repeat(${numCols},1fr);gap:${gap}">
        ${tables}
      </div>
      <div style="text-align:right;font-weight:700;font-size:13px;
                  margin-top:10px;padding-top:6px;border-top:2px solid #EDE8E2">
        合計 ${formatCurrency(total)}
      </div>
    `;
  }

  function _buildEntryTable(entries, catMap, showCategory, fontSize) {
    const fs = fontSize || '12px';
    const catTh = showCategory ? '<th style="text-align:left">区分</th>' : '';

    const rows = entries.map(e => {
      const catTd = showCategory
        ? `<td>${escHtml(catMap[e.categoryId] || '未分類')}</td>`
        : '';
      return `<tr>
        <td style="text-align:center;color:#78716C">${e.day}日</td>
        <td>${escHtml(e.item)}</td>
        ${catTd}
        <td style="text-align:right;font-weight:600">${formatCurrency(e.amount)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="4" style="color:#78716C">なし</td></tr>';

    return `
      <table style="width:100%;border-collapse:collapse;font-size:${fs}">
        <thead>
          <tr>
            <th style="text-align:center">日</th>
            <th style="text-align:left">項目</th>
            ${catTh}
            <th style="text-align:right">金額</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  return { render, setSortOrder };
})();
