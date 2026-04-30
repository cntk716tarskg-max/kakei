/* =====================================================
   settings.js — 区分・予算・収入・固定費 の CRUD
   Overview から呼ばれる inline onclick 関数群
   ===================================================== */

const Settings = (() => {

  /* ---------- 共通ヘルパー: モーダル内 Enter キーナビゲーション ----------
     pairs: [{ from: 'inputId', to: 'nextInputId' | null, save: fn | null }]
     - to が文字列 → Enter でそちらへフォーカス移動
     - save が関数 → Enter で呼び出し（最終フィールド）
  ---------- */
  function _bindEnter(pairs) {
    setTimeout(() => {
      pairs.forEach(({ from, to, save }) => {
        const el = document.getElementById(from);
        if (!el) return;
        el.addEventListener('keydown', e => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (to) {
            const next = document.getElementById(to);
            if (next) { next.focus(); next.select && next.select(); }
          } else if (save) {
            save();
          }
        });
      });
    }, 80);
  }

  /* =========================================
     区分管理（カテゴリ追加・削除）
     ========================================= */

  function openCategoryManager(year, month) {
    _renderCategoryModal(year, month);
  }

  function _renderCategoryModal(year, month) {
    const cats = Storage.getCategories();

    const rows = cats.map(c => `
      <div class="row-item" id="cat-row-${c.id}">
        <span class="row-item-label">${escHtml(c.name)}</span>
        <button class="btn-danger-ghost" onclick="Settings._deleteCategory('${c.id}', ${year}, ${month})">削除</button>
      </div>
    `).join('');

    const limitMsg = cats.length >= 12
      ? '<p style="font-size:12px;color:var(--clr-warning);margin-top:8px">区分は最大12個です</p>'
      : '';

    Modal.open('区分編集', `
      <div id="cat-list">
        ${cats.length === 0
          ? '<p style="color:var(--clr-text-sub);font-size:14px;text-align:center;padding:12px 0">区分がありません</p>'
          : rows}
      </div>
      <hr class="divider">
      ${cats.length < 12 ? `
      <div class="form-group" style="margin-top:12px">
        <label class="form-label">区分名を追加</label>
        <div style="display:flex;gap:8px">
          <input id="new-cat-name" class="form-input" type="text" placeholder="例：食費" maxlength="20">
          <button class="btn-secondary" onclick="Settings._addCategory(${year}, ${month})" style="white-space:nowrap">追加</button>
        </div>
      </div>` : ''}
      ${limitMsg}
    `);

    _bindEnter([
      { from: 'new-cat-name', to: null, save: () => Settings._addCategory(year, month) }
    ]);
  }

  function _addCategory(year, month) {
    const inp  = document.getElementById('new-cat-name');
    const name = inp ? inp.value.trim() : '';
    if (!name) { if (inp) inp.classList.add('input-error'); return; }

    const cats = Storage.getCategories();
    if (cats.length >= 12) return;
    if (cats.some(c => c.name === name)) {
      if (inp) {
        inp.classList.add('input-error');
        inp.value = '';
        inp.placeholder = 'すでに存在します';
      }
      return;
    }

    cats.push({ id: Storage.genId(), name });
    Storage.saveCategories(cats);
    _renderCategoryModal(year, month);
    App.refresh();
  }

  function _deleteCategory(id, year, month) {
    if (!confirmDialog('この区分を削除しますか？\n（既存の明細の区分指定は残ります）')) return;

    const cats = Storage.getCategories().filter(c => c.id !== id);
    Storage.saveCategories(cats);

    const md = Storage.getMonthData(year, month);
    delete md.budgets[id];
    Storage.saveMonthData(year, month, md);

    _renderCategoryModal(year, month);
    App.refresh();
  }

  /* =========================================
     区分別予算 編集
     ========================================= */

  function openBudgetEdit(catId, year, month) {
    const cats = Storage.getCategories();
    const cat  = cats.find(c => c.id === catId);
    if (!cat) return;
    const md      = Storage.getMonthData(year, month);
    const current = md.budgets[catId] || 0;

    Modal.open(`予算を設定：${escHtml(cat.name)}`, `
      <div class="form-group">
        <label class="form-label">予算金額（¥）</label>
        <input id="budget-input" class="form-input" type="number" min="0"
          inputmode="numeric" value="${current}" placeholder="0">
      </div>
      <div class="modal-btns">
        <button class="btn-cancel" onclick="Modal.close()">キャンセル</button>
        <button class="btn-save" onclick="Settings._saveBudget('${catId}', ${year}, ${month})">保存</button>
      </div>
    `);

    _bindEnter([
      { from: 'budget-input', to: null, save: () => Settings._saveBudget(catId, year, month) }
    ]);
  }

  function _saveBudget(catId, year, month) {
    const inp    = document.getElementById('budget-input');
    const amount = parseInt(inp ? inp.value : '0') || 0;

    // 現在月を保存（Firestore push も内部で発火）
    const md = Storage.getMonthData(year, month);
    md.budgets[catId] = amount;
    Storage.saveMonthData(year, month, md);

    // 既存の未来月にも同じ予算を反映（未来月は次回ナビゲーション時に Firestore へ push）
    const data    = Storage.loadAll();
    const fromKey = Storage.monthKey(year, month);
    let   changed = false;
    Object.keys(data.months).forEach(mk => {
      if (mk > fromKey) {
        if (!data.months[mk].budgets) data.months[mk].budgets = {};
        data.months[mk].budgets[catId] = amount;
        changed = true;
      }
    });
    if (changed) Storage.saveAll(data);

    Modal.close();
    App.refresh();
  }

  /* =========================================
     収入 CRUD
     ========================================= */

  function openIncomeAdd(year, month) {
    Modal.open('収入を追加', `
      <div class="form-group">
        <label class="form-label">名称</label>
        <input id="inc-label" class="form-input" type="text" placeholder="例：給与" maxlength="30">
      </div>
      <div class="form-group">
        <label class="form-label">金額（¥）</label>
        <input id="inc-amount" class="form-input" type="number" min="0"
          inputmode="numeric" placeholder="0">
      </div>
      <div class="modal-btns">
        <button class="btn-cancel" onclick="Modal.close()">キャンセル</button>
        <button class="btn-save" onclick="Settings._saveIncomeAdd(${year}, ${month})">追加</button>
      </div>
    `);

    _bindEnter([
      { from: 'inc-label',  to: 'inc-amount', save: null },
      { from: 'inc-amount', to: null, save: () => Settings._saveIncomeAdd(year, month) }
    ]);
  }

  function _saveIncomeAdd(year, month) {
    const label  = (document.getElementById('inc-label').value  || '').trim();
    const amount = parseInt(document.getElementById('inc-amount').value) || 0;
    if (!label || amount < 0) return;

    const md = Storage.getMonthData(year, month);
    md.income.push({ id: Storage.genId(), label, amount });
    Storage.saveMonthData(year, month, md);
    Modal.close();
    App.refresh();
  }

  function openIncomeEdit(id, year, month) {
    const md  = Storage.getMonthData(year, month);
    const inc = md.income.find(i => i.id === id);
    if (!inc) return;

    Modal.open('収入を編集', `
      <div class="form-group">
        <label class="form-label">名称</label>
        <input id="inc-label" class="form-input" type="text" value="${escHtml(inc.label)}" maxlength="30">
      </div>
      <div class="form-group">
        <label class="form-label">金額（¥）</label>
        <input id="inc-amount" class="form-input" type="number" min="0"
          inputmode="numeric" value="${inc.amount}">
      </div>
      <div class="modal-btns">
        <button class="btn-cancel" onclick="Modal.close()">キャンセル</button>
        <button class="btn-save" onclick="Settings._saveIncomeEdit('${id}', ${year}, ${month})">保存</button>
      </div>
    `);

    _bindEnter([
      { from: 'inc-label',  to: 'inc-amount', save: null },
      { from: 'inc-amount', to: null, save: () => Settings._saveIncomeEdit(id, year, month) }
    ]);
  }

  function _saveIncomeEdit(id, year, month) {
    const label  = (document.getElementById('inc-label').value  || '').trim();
    const amount = parseInt(document.getElementById('inc-amount').value) || 0;
    if (!label || amount < 0) return;

    const md  = Storage.getMonthData(year, month);
    const idx = md.income.findIndex(i => i.id === id);
    if (idx !== -1) md.income[idx] = { ...md.income[idx], label, amount };
    Storage.saveMonthData(year, month, md);
    Modal.close();
    App.refresh();
  }

  function deleteIncome(id, year, month) {
    if (!confirmDialog('この収入を削除しますか？')) return;
    const md = Storage.getMonthData(year, month);
    md.income = md.income.filter(i => i.id !== id);
    Storage.saveMonthData(year, month, md);
    App.refresh();
  }

  /* =========================================
     固定費 CRUD
     ========================================= */

  function openFixedAdd(year, month) {
    Modal.open('固定費を追加', `
      <div class="form-group">
        <label class="form-label">名称</label>
        <input id="fix-label" class="form-input" type="text" placeholder="例：家賃" maxlength="30">
      </div>
      <div class="form-group">
        <label class="form-label">金額（¥）</label>
        <input id="fix-amount" class="form-input" type="number" min="0"
          inputmode="numeric" placeholder="0">
      </div>
      <p style="font-size:12px;color:var(--clr-text-sub);margin-top:8px">
        固定費は予算・支出の両方に反映されます（翌月以降も引き継ぎます）
      </p>
      <div class="modal-btns">
        <button class="btn-cancel" onclick="Modal.close()">キャンセル</button>
        <button class="btn-save" onclick="Settings._saveFixedAdd(${year}, ${month})">追加</button>
      </div>
    `);

    _bindEnter([
      { from: 'fix-label',  to: 'fix-amount', save: null },
      { from: 'fix-amount', to: null, save: () => Settings._saveFixedAdd(year, month) }
    ]);
  }

  function _saveFixedAdd(year, month) {
    const label  = (document.getElementById('fix-label').value  || '').trim();
    const amount = parseInt(document.getElementById('fix-amount').value) || 0;
    if (!label || amount < 0) return;

    const md = Storage.getMonthData(year, month);
    md.fixedCosts.push({ id: Storage.genId(), label, amount });
    Storage.saveMonthData(year, month, md);
    Modal.close();
    App.refresh();
  }

  function openFixedEdit(id, year, month) {
    const md  = Storage.getMonthData(year, month);
    const fix = md.fixedCosts.find(f => f.id === id);
    if (!fix) return;

    Modal.open('固定費を編集', `
      <div class="form-group">
        <label class="form-label">名称</label>
        <input id="fix-label" class="form-input" type="text" value="${escHtml(fix.label)}" maxlength="30">
      </div>
      <div class="form-group">
        <label class="form-label">金額（¥）</label>
        <input id="fix-amount" class="form-input" type="number" min="0"
          inputmode="numeric" value="${fix.amount}">
      </div>
      <div class="modal-btns">
        <button class="btn-cancel" onclick="Modal.close()">キャンセル</button>
        <button class="btn-save" onclick="Settings._saveFixedEdit('${id}', ${year}, ${month})">保存</button>
      </div>
    `);

    _bindEnter([
      { from: 'fix-label',  to: 'fix-amount', save: null },
      { from: 'fix-amount', to: null, save: () => Settings._saveFixedEdit(id, year, month) }
    ]);
  }

  function _saveFixedEdit(id, year, month) {
    const label  = (document.getElementById('fix-label').value  || '').trim();
    const amount = parseInt(document.getElementById('fix-amount').value) || 0;
    if (!label || amount < 0) return;

    const md  = Storage.getMonthData(year, month);
    const idx = md.fixedCosts.findIndex(f => f.id === id);
    if (idx !== -1) md.fixedCosts[idx] = { ...md.fixedCosts[idx], label, amount };
    Storage.saveMonthData(year, month, md);
    Modal.close();
    App.refresh();
  }

  function deleteFixed(id, year, month) {
    if (!confirmDialog('この固定費を削除しますか？')) return;
    const md = Storage.getMonthData(year, month);
    md.fixedCosts = md.fixedCosts.filter(f => f.id !== id);
    Storage.saveMonthData(year, month, md);
    App.refresh();
  }

  /* ===== 公開 ===== */
  return {
    openCategoryManager, _addCategory, _deleteCategory,
    openBudgetEdit,  _saveBudget,
    openIncomeAdd,   _saveIncomeAdd,  openIncomeEdit,  _saveIncomeEdit,  deleteIncome,
    openFixedAdd,    _saveFixedAdd,   openFixedEdit,   _saveFixedEdit,   deleteFixed
  };
})();
