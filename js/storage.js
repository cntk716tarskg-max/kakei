/* =====================================================
   storage.js — LocalStorage データ層
   すべての永続化操作はここに集約する
   ===================================================== */

const Storage = (() => {
  const KEY = 'kakei_plus_v1';

  /* ---------- 基本 I/O ---------- */

  function loadAll() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : _default();
    } catch {
      return _default();
    }
  }

  function saveAll(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function _default() {
    return { version: 1, categories: [], months: {}, suggestions: [] };
  }

  /* ---------- キー生成 ---------- */

  function monthKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
  }

  /* ---------- 月データ ---------- */

  function getMonthData(year, month) {
    const data = loadAll();
    const key  = monthKey(year, month);
    if (data.months[key]) return data.months[key];

    // 前月からコピーして初期化
    let py = year, pm = month - 1;
    if (pm === 0) { pm = 12; py--; }
    const prev = data.months[monthKey(py, pm)];

    const md = {
      income:     [],
      budgets:    prev ? Object.assign({}, prev.budgets) : {},
      fixedCosts: prev ? prev.fixedCosts.map(f => Object.assign({}, f)) : [],
      entries:    []
    };
    data.months[key] = md;
    saveAll(data);
    return md;
  }

  function saveMonthData(year, month, md) {
    const data = loadAll();
    data.months[monthKey(year, month)] = md;
    saveAll(data);
    if (typeof FirestoreDB !== 'undefined' && FirestoreDB.isReady()) {
      FirestoreDB.pushMonthData(year, month);
    }
  }

  /* ---------- カテゴリ ---------- */

  function getCategories() {
    return loadAll().categories;
  }

  function saveCategories(cats) {
    const data = loadAll();
    data.categories = cats;
    saveAll(data);
    if (typeof FirestoreDB !== 'undefined' && FirestoreDB.isReady()) {
      FirestoreDB.pushProfile();
    }
  }

  /* ---------- 入力候補（オートコンプリート） ---------- */

  function getSuggestions() {
    return loadAll().suggestions || [];
  }

  function recordSuggestion(item) {
    if (!item || !item.trim()) return;
    const data = loadAll();
    if (!data.suggestions) data.suggestions = [];
    data.suggestions = data.suggestions.filter(s => s !== item);
    data.suggestions.unshift(item);
    if (data.suggestions.length > 300) data.suggestions = data.suggestions.slice(0, 300);
    saveAll(data);
    if (typeof FirestoreDB !== 'undefined' && FirestoreDB.isReady()) {
      FirestoreDB.pushProfile();
    }
  }

  /* ---------- ユーティリティ ---------- */

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return {
    loadAll, saveAll,
    monthKey,
    getMonthData, saveMonthData,
    getCategories, saveCategories,
    getSuggestions, recordSuggestion,
    genId
  };
})();
