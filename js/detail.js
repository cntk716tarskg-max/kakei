/* =====================================================
   detail.js — 明細入力・一覧
   ===================================================== */

const Detail = (() => {

  let _year, _month;
  let _lastDay = null;  // 最後に入力した日を記憶して連続入力を助ける

  /* ===== メインレンダリング ===== */
  function render(year, month) {
    _year  = year;
    _month = month;
    _renderForm();
    _renderList();
  }

  /* ===== 入力フォーム ===== */
  function _renderForm() {
    const cats  = Storage.getCategories();
    const today = new Date();
    const defaultDay = (_year === today.getFullYear() && _month === (today.getMonth() + 1))
      ? today.getDate()
      : (_lastDay || 1);

    const catOptions = cats.map(c =>
      `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`
    ).join('');

    document.getElementById('detail-input-section').innerHTML = `
      <div class="card">
        <div class="card-title">
          <div class="card-title-left">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>
            明細入力
          </div>
        </div>

        <div class="detail-form">
          <div class="form-group">
            <label class="form-label" for="inp-day">日</label>
            <input id="inp-day" class="form-input" type="number" min="1" max="31"
              inputmode="numeric" value="${defaultDay}" placeholder="日">
          </div>
          <div class="form-group">
            <label class="form-label" for="inp-item">項目</label>
            <input id="inp-item" class="form-input" type="text"
              autocomplete="off" placeholder="例：スーパー">
          </div>
          <div class="form-group">
            <label class="form-label" for="inp-amount">金額</label>
            <input id="inp-amount" class="form-input" type="number" min="0"
              inputmode="numeric" placeholder="0">
          </div>
        </div>

        <div class="detail-form-row2">
          <div class="form-group">
            <label class="form-label" for="inp-cat">区分</label>
            <select id="inp-cat" class="form-input">
              <option value="">-- 選択 --</option>
              ${catOptions}
            </select>
          </div>
          <button class="detail-add-btn" id="btn-add-entry">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            追加
          </button>
        </div>

        <p class="form-hint">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          日→項目→金額→区分の順にEnterで進みます
        </p>
      </div>
    `;

    _bindFormEvents();
  }

  /* ===== フォームイベント ===== */
  function _bindFormEvents() {
    const dayEl    = document.getElementById('inp-day');
    const itemEl   = document.getElementById('inp-item');
    const amtEl    = document.getElementById('inp-amount');
    const catEl    = document.getElementById('inp-cat');
    const addBtn   = document.getElementById('btn-add-entry');

    // Enter キーフロー
    dayEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); itemEl.focus(); itemEl.select(); }
    });
    itemEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _hideAC(); amtEl.focus(); amtEl.select(); }
    });
    amtEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); catEl.focus(); }
    });
    catEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _saveEntry(); }
    });

    addBtn.addEventListener('click', _saveEntry);

    // オートコンプリート
    itemEl.addEventListener('input', () => _showAC(itemEl));
    itemEl.addEventListener('blur', () => setTimeout(_hideAC, 150));

    // 入力フィールド全選択
    [dayEl, amtEl].forEach(el => el.addEventListener('focus', () => el.select()));
  }

  /* ===== エントリー保存 ===== */
  function _saveEntry() {
    const dayEl  = document.getElementById('inp-day');
    const itemEl = document.getElementById('inp-item');
    const amtEl  = document.getElementById('inp-amount');
    const catEl  = document.getElementById('inp-cat');

    const day    = parseInt(dayEl.value);
    const item   = itemEl.value.trim();
    const amount = parseInt(amtEl.value);
    const catId  = catEl.value;

    // バリデーション
    let valid = true;
    [dayEl, itemEl, amtEl, catEl].forEach(el => el.classList.remove('input-error'));

    const max = daysInMonth(_year, _month);
    if (!day || day < 1 || day > max) { dayEl.classList.add('input-error'); valid = false; }
    if (!item)   { itemEl.classList.add('input-error'); valid = false; }
    if (!amount || amount <= 0) { amtEl.classList.add('input-error'); valid = false; }
    if (!catId)  { catEl.classList.add('input-error'); valid = false; }
    if (!valid) return;

    const md = Storage.getMonthData(_year, _month);
    md.entries.push({ id: Storage.genId(), day, item, amount, categoryId: catId });
    Storage.saveMonthData(_year, _month, md);
    Storage.recordSuggestion(item);

    _lastDay = day;

    // リセット（日は保持）
    itemEl.value = '';
    amtEl.value  = '';
    catEl.value  = '';
    [dayEl, itemEl, amtEl, catEl].forEach(el => el.classList.remove('input-error'));

    _renderList();
    dayEl.focus();
    dayEl.select();
  }

  /* ===== 明細一覧 ===== */
  function _renderList() {
    const md      = Storage.getMonthData(_year, _month);
    const cats    = Storage.getCategories();
    const catMap  = Object.fromEntries(cats.map(c => [c.id, c.name]));
    const el      = document.getElementById('detail-list-section');

    if (md.entries.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
          まだ明細がありません
        </div>`;
      return;
    }

    // 日付順ソート
    const sorted = [...md.entries].sort((a, b) => a.day - b.day || 0);

    const total = sorted.reduce((s, e) => s + e.amount, 0);

    let html = `<div class="detail-list-header">
      <span class="detail-list-count">${sorted.length}件 / 合計 ${formatCurrency(total)}</span>
    </div>`;

    let prevDay = null;
    sorted.forEach(entry => {
      if (entry.day !== prevDay) {
        html += `<div class="day-group-header">${entry.day}日</div>`;
        prevDay = entry.day;
      }
      const catName = catMap[entry.categoryId] || '未分類';
      html += `
        <div class="detail-entry">
          <span class="detail-entry-day">${entry.day}</span>
          <div class="detail-entry-info">
            <div class="detail-entry-item">${escHtml(entry.item)}</div>
            <div class="detail-entry-cat">${escHtml(catName)}</div>
          </div>
          <span class="detail-entry-amount">${formatCurrency(entry.amount)}</span>
          <div class="detail-entry-actions">
            <button class="btn-icon-sm" onclick="Detail.openEditEntry('${entry.id}')" title="編集">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </button>
            <button class="btn-icon-sm btn-danger-ghost" onclick="Detail.deleteEntry('${entry.id}')" title="削除">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </button>
          </div>
        </div>
      `;
    });

    el.innerHTML = html;
  }

  /* ===== 明細編集モーダル ===== */
  function openEditEntry(id) {
    const md      = Storage.getMonthData(_year, _month);
    const entry   = md.entries.find(e => e.id === id);
    if (!entry) return;
    const cats    = Storage.getCategories();
    const catOpts = cats.map(c =>
      `<option value="${escHtml(c.id)}" ${c.id === entry.categoryId ? 'selected' : ''}>${escHtml(c.name)}</option>`
    ).join('');

    Modal.open('明細を編集', `
      <div class="edit-form-grid">
        <div class="form-group">
          <label class="form-label">日</label>
          <input id="edit-day" class="form-input" type="number" min="1" max="31"
            inputmode="numeric" value="${entry.day}">
        </div>
        <div class="form-group">
          <label class="form-label">項目</label>
          <input id="edit-item" class="form-input" type="text" value="${escHtml(entry.item)}" autocomplete="off">
        </div>
        <div class="form-group">
          <label class="form-label">金額</label>
          <input id="edit-amount" class="form-input" type="number" min="0"
            inputmode="numeric" value="${entry.amount}">
        </div>
        <div class="form-group">
          <label class="form-label">区分</label>
          <select id="edit-cat" class="form-input">
            <option value="">-- 選択 --</option>
            ${catOpts}
          </select>
        </div>
      </div>
      <div class="modal-btns">
        <button class="btn-cancel" onclick="Modal.close()">キャンセル</button>
        <button class="btn-save" onclick="Detail._saveEditEntry('${id}')">保存</button>
      </div>
    `);
  }

  function _saveEditEntry(id) {
    const day    = parseInt(document.getElementById('edit-day').value);
    const item   = document.getElementById('edit-item').value.trim();
    const amount = parseInt(document.getElementById('edit-amount').value);
    const catId  = document.getElementById('edit-cat').value;

    if (!day || !item || !amount || !catId) return;

    const md    = Storage.getMonthData(_year, _month);
    const idx   = md.entries.findIndex(e => e.id === id);
    if (idx === -1) { Modal.close(); return; }

    md.entries[idx] = { ...md.entries[idx], day, item, amount, categoryId: catId };
    Storage.saveMonthData(_year, _month, md);
    Storage.recordSuggestion(item);
    Modal.close();
    _renderList();
  }

  /* ===== 明細削除 ===== */
  function deleteEntry(id) {
    if (!confirmDialog('この明細を削除しますか？')) return;
    const md = Storage.getMonthData(_year, _month);
    md.entries = md.entries.filter(e => e.id !== id);
    Storage.saveMonthData(_year, _month, md);
    _renderList();
  }

  /* ===== オートコンプリート ===== */
  function _showAC(inputEl) {
    const query = inputEl.value.trim().toLowerCase();
    const list  = document.getElementById('autocomplete-list');

    if (!query) { _hideAC(); return; }

    const suggestions = Storage.getSuggestions()
      .filter(s => s.toLowerCase().includes(query))
      .slice(0, 8);

    if (suggestions.length === 0) { _hideAC(); return; }

    const rect = inputEl.getBoundingClientRect();
    list.style.top    = (rect.bottom + window.scrollY + 2) + 'px';
    list.style.left   = rect.left + 'px';
    list.style.width  = rect.width + 'px';

    list.innerHTML = suggestions.map(s =>
      `<li onclick="Detail._selectSuggestion('${escHtml(s)}')">${escHtml(s)}</li>`
    ).join('');
    list.classList.remove('hidden');
  }

  function _selectSuggestion(value) {
    const itemEl = document.getElementById('inp-item');
    if (itemEl) {
      itemEl.value = value;
      _hideAC();
      const amtEl = document.getElementById('inp-amount');
      if (amtEl) { amtEl.focus(); amtEl.select(); }
    }
  }

  function _hideAC() {
    const list = document.getElementById('autocomplete-list');
    if (list) list.classList.add('hidden');
  }

  return {
    render,
    openEditEntry,
    _saveEditEntry,
    deleteEntry,
    _selectSuggestion
  };
})();
