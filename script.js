/* Vocabulary Practice – vanilla JS, no dependencies */
(() => {
  'use strict';

  const CSV_PATH = 'data/vocabulary.csv';
  const KEYS = { practiced: 'vp-practiced', recent: 'vp-recent', theme: 'vp-theme' };
  const SWAP_MS = 180; // must match .swap transition in style.css

  const $ = (id) => document.getElementById(id);
  const els = {
    loading: $('loading'), alertArea: $('alert-area'), card: $('vocab-card'),
    content: $('card-content'), word: $('word'), meaning: $('meaning'),
    meaningWrap: $('meaning-wrap'), toggleBtn: $('toggle-meaning'), nextBtn: $('next-word'),
    stats: $('stats'), total: $('total-count'), practiced: $('practiced-count'),
    bar: $('round-bar'), progress: $('round-progress'), themeBtn: $('theme-toggle'),
  };

  let vocabulary = [];   // [{ word, meaning }]
  let recent = [];       // words shown in the current round
  let practiced = 0;     // total words viewed (persisted)
  let busy = false;      // true while the swap animation runs

  /* ---------- Storage helpers (fail silently if storage is blocked) ---------- */
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
  };

  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- CSV ---------- */

  // Fetch the CSV and turn it into vocabulary entries
  async function loadVocabulary() {
    const response = await fetch(CSV_PATH, { cache: 'no-store' });
    if (!response.ok) throw new Error('missing-file');
    return parseCSV(await response.text());
  }

  // Split raw CSV text into rows of fields (handles quotes, "" escapes, CRLF)
  function splitCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    text = text.replace(/^\uFEFF/, ''); // strip BOM

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
        } else { field += c; }
      } else if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else { field += c; }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((f) => f.trim() !== '')); // drop empty rows
  }

  // Convert rows into [{ word, meaning }], validating the header
  function parseCSV(text) {
    const rows = splitCSV(text);
    if (!rows.length) throw new Error('empty');

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const wi = header.indexOf('word');
    let mi = header.indexOf('meaning');
    if (mi === -1) mi = header.indexOf('definition');
    if (wi === -1 || mi === -1) throw new Error('bad-columns');

    const entries = [];
    for (const row of rows.slice(1)) {
      const word = (row[wi] || '').trim();
      if (!word) continue; // skip rows without a word
      // If meaning is the last column, tolerate unquoted commas inside it
      const raw = mi === header.length - 1 ? row.slice(mi).join(',') : row[mi];
      entries.push({ word, meaning: (raw || '').replace(/\s+/g, ' ').trim() });
    }
    if (!entries.length) throw new Error('empty');
    return entries;
  }

  /* ---------- Word selection ---------- */

  // Pick a random word that hasn't appeared in the current round
  function selectRandomWord() {
    const seen = new Set(recent);
    let pool = vocabulary.filter((e) => !seen.has(e.word));

    if (!pool.length) { // every word used: start a new round, but avoid an immediate repeat
      const last = recent[recent.length - 1];
      recent = [];
      pool = vocabulary.length > 1 ? vocabulary.filter((e) => e.word !== last) : vocabulary;
    }
    const entry = pool[Math.floor(Math.random() * pool.length)];
    recent.push(entry.word);
    store.set(KEYS.recent, JSON.stringify(recent));
    return entry;
  }

  /* ---------- Display ---------- */

  function displayWord(entry, animate = true) {
    const apply = () => {
      els.word.textContent = entry.word;
      els.meaning.textContent = entry.meaning || 'No meaning provided for this word.';
      els.meaning.classList.toggle('is-missing', !entry.meaning);
      practiced += 1;
      store.set(KEYS.practiced, String(practiced));
      updateStats();
    };

    if (!animate || prefersReducedMotion()) { apply(); return; }

    busy = true;
    els.content.classList.add('is-leaving');           // fade out
    setTimeout(() => {
      apply();                                          // swap content
      els.content.classList.remove('is-leaving');
      els.content.classList.add('is-entering');         // start below, invisible
      requestAnimationFrame(() => requestAnimationFrame(() => {
        els.content.classList.remove('is-entering');    // fade in
        busy = false;
      }));
    }, SWAP_MS);
  }

  function showMeaning() {
    els.meaningWrap.classList.add('is-open');
    els.meaningWrap.setAttribute('aria-hidden', 'false');
    els.toggleBtn.setAttribute('aria-expanded', 'true');
    els.toggleBtn.textContent = 'Hide Meaning';
  }

  function hideMeaning() {
    els.meaningWrap.classList.remove('is-open');
    els.meaningWrap.setAttribute('aria-hidden', 'true');
    els.toggleBtn.setAttribute('aria-expanded', 'false');
    els.toggleBtn.textContent = 'Show Meaning';
  }

  function toggleMeaning() {
    els.meaningWrap.classList.contains('is-open') ? hideMeaning() : showMeaning();
  }

  function nextWord() {
    if (busy || !vocabulary.length) return;
    hideMeaning();
    displayWord(selectRandomWord(), true);
  }

  function updateStats() {
    els.total.textContent = vocabulary.length.toLocaleString();
    els.practiced.textContent = `${practiced.toLocaleString()} ${practiced === 1 ? 'word' : 'words'} practiced`;
    const pct = vocabulary.length ? Math.min(100, Math.round((recent.length / vocabulary.length) * 100)) : 0;
    els.progress.style.width = pct + '%';
    els.bar.setAttribute('aria-valuenow', String(pct));
  }

  /* ---------- Theme ---------- */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    const next = theme === 'dark' ? 'light' : 'dark';
    els.themeBtn.textContent = next === 'dark' ? '\u{1F319} Dark' : '\u2600 Light';
    els.themeBtn.setAttribute('aria-label', `Switch to ${next} theme`);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store.set(KEYS.theme, next);
  }

  /* ---------- Errors ---------- */

  function showError(title, detail) {
    els.loading.hidden = true;
    els.card.hidden = true;
    els.stats.hidden = false;
    els.practiced.hidden = true;
    els.total.parentElement.hidden = true;

    const alert = document.createElement('div');
    alert.className = 'alert alert-danger';
    alert.setAttribute('role', 'alert');
    const strong = document.createElement('strong');
    strong.textContent = title;
    alert.append(strong, document.createElement('br'), document.createTextNode(detail));
    els.alertArea.replaceChildren(alert);
  }

  function explainError(err) {
    switch (err && err.message) {
      case 'bad-columns':
        return ['Vocabulary file is not set up correctly.', 'The first line of vocabulary.csv must be: word,meaning'];
      case 'empty':
        return ['No vocabulary found.', 'Add rows under the "word,meaning" header in data/vocabulary.csv.'];
      default:
        return ['Unable to load vocabulary.', 'Please make sure vocabulary.csv exists in the data folder, and open the site through a local server (such as VS Code Live Server).'];
    }
  }

  /* ---------- Events ---------- */

  function bindEvents() {
    els.nextBtn.addEventListener('click', nextWord);
    els.toggleBtn.addEventListener('click', toggleMeaning);
    els.themeBtn.addEventListener('click', toggleTheme);

    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const typing = t.closest && t.closest('input, textarea, select, [contenteditable="true"]');
      if (typing) return;                         // never hijack typing
      if (t.tagName === 'BUTTON' || t.tagName === 'A') return; // let focused controls use their own Space
      e.preventDefault();                          // stop the page from scrolling
      nextWord();
    });
  }

  /* ---------- Init ---------- */

  async function init() {
    const saved = store.get(KEYS.theme);
    applyTheme(saved === 'dark' ? 'dark' : 'light');
    els.themeBtn.closest('footer').hidden = false;
    els.stats.hidden = false;
    bindEvents();

    try {
      vocabulary = await loadVocabulary();
    } catch (err) {
      showError(...explainError(err));
      return;
    }

    practiced = parseInt(store.get(KEYS.practiced), 10) || 0;
    try {
      const stored = JSON.parse(store.get(KEYS.recent) || '[]');
      const known = new Set(vocabulary.map((v) => v.word));
      recent = Array.isArray(stored) ? stored.filter((w) => known.has(w)) : [];
    } catch { recent = []; }

    els.loading.hidden = true;
    els.card.hidden = false;
    displayWord(selectRandomWord(), false);
  }

  init();
})();
