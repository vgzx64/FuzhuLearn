// ponytail: localStorage-backed progress tracker. No DB, no API.
// Ceiling: single-user, no sync. Upgrade path: swap localStorage for IndexedDB.

const STORAGE_KEY = 'fuzhu-progress';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function save(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getProgress() {
  const p = load();
  if (p) return p;
  // First visit: seed empty progress
  const seed = { levels: {}, hanzi: {} };
  save(seed);
  return seed;
}

export function markHanziLearned(char, points = 1) {
  const p = getProgress();
  const prev = p.hanzi[char] || { status: 'new', correct: 0 };
  const newCorrect = (prev.correct || 0) + points;
  p.hanzi[char] = { status: 'learned', correct: newCorrect };
  save(p);
}

export function markHanziWrong(char) {
  const p = getProgress();
  const prev = p.hanzi[char] || { status: 'new', correct: 0 };
  p.hanzi[char] = { status: 'learning', correct: Math.max(0, (prev.correct || 0) - 1) };
  save(p);
}

export function markLevelComplete(level) {
  const p = getProgress();
  p.levels[String(level)] = { completed: true };
  save(p);
}

export function isLevelComplete(level) {
  const p = getProgress();
  return !!p.levels[String(level)]?.completed;
}

export function getHanziStatus(char) {
  const p = getProgress();
  return p.hanzi[char] || { status: 'new', correct: 0 };
}

export function getLevelStats(level, hanziList) {
  const p = getProgress();
  const chars = hanziList.filter(h => h.l === level);
  let total = chars.length;
  let learned = 0;
  for (const h of chars) {
    const s = p.hanzi[h.c];
    if (s?.status === 'learned') learned++;
  }
  return { total, learned, pct: total ? Math.round(learned / total * 100) : 0 };
}