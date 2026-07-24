// ponytail: AsyncStorage-backed progress tracker with SM-2 spaced repetition.
// No DB, no API. Ceiling: single-user, no sync. Upgrade path: IndexedDB.
// SM-2 fields: ef (easiness factor), interval (days), reps (consecutive passes), nextReview (ISO date).

import AsyncStorage from '@react-native-async-storage/async-storage';

// ponytail: hardcoded Anki-like defaults. Will be exposed as user settings later.
const DECK_CONFIG = {
  newCardsPerDay: 10,
  maxReviewsPerDay: 20,
  maxNewPerSession: 5,
  newFirst: true,
  graduatingInterval: 1,
  easyInterval: 4,
  startingEase: 2.5,
  minInterval: 1,
  maxInterval: 365,
};

const STORAGE_KEY = 'fuzhu-progress';

async function load() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function save(data) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function ensureSM2(entry) {
  // Fill missing SM-2 fields for backward compatibility
  if (entry.ef === undefined) entry.ef = DECK_CONFIG.startingEase;
  if (entry.interval === undefined) entry.interval = 0;
  if (entry.reps === undefined) entry.reps = 0;
  if (entry.nextReview === undefined) entry.nextReview = null;
  return entry;
}

export async function getProgress() {
  const p = await load();
  if (p) {
    // Ensure all hanzi entries have SM-2 fields
    for (const char of Object.keys(p.hanzi || {})) {
      ensureSM2(p.hanzi[char]);
    }
    return p;
  }
  const seed = { levels: {}, hanzi: {} };
  await save(seed);
  return seed;
}

export async function getHanziStatus(char) {
  const p = await getProgress();
  return ensureSM2(p.hanzi[char] || { status: 'new', correct: 0 });
}

// SM-2 algorithm: score maps to quality 0-4 (0=forgot, 2=hard, 3=good, 4=easy)
export async function markHanziReviewed(char, score) {
  const p = await getProgress();
  const prev = ensureSM2(p.hanzi[char] || { status: 'new', correct: 0, ef: DECK_CONFIG.startingEase, interval: 0, reps: 0, nextReview: null });

  // Map score to SM-2 quality
  let q;
  if (score >= 0.95) q = 4;       // easy
  else if (score >= 0.7) q = 3;   // good
  else if (score >= 0.5) q = 2;   // hard
  else q = 0;                      // forgot

  const oldEF = prev.ef;
  let ef, interval, reps;

  if (q < 3) {
    // Failed: reset
    ef = oldEF;
    interval = 1;
    reps = 0;
  } else {
    // Passed: apply SM-2 formula
    if (prev.reps === 0) {
      interval = 1;
    } else if (prev.reps === 1) {
      interval = DECK_CONFIG.graduatingInterval;
    } else {
      interval = Math.round(prev.interval * prev.ef);
    }
    // Clamp interval
    interval = Math.max(DECK_CONFIG.minInterval, Math.min(DECK_CONFIG.maxInterval, interval));

    // Update EF
    ef = oldEF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ef < 1.3) ef = 1.3;
    reps = prev.reps + 1;

    // Easy bonus
    if (q === 4) interval = Math.max(interval, DECK_CONFIG.easyInterval);
  }

  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  const newCorrect = (prev.correct || 0) + score;

  p.hanzi[char] = {
    status: q >= 3 ? 'learned' : 'learning',
    correct: newCorrect,
    ef: Math.round(ef * 100) / 100,
    interval,
    reps,
    nextReview: nextReview.toISOString().slice(0, 10),
  };
  await save(p);
}

export async function markHanziForgotten(char) {
  const p = await getProgress();
  p.hanzi[char] = {
    status: 'new',
    correct: 0,
    ef: DECK_CONFIG.startingEase,
    interval: 0,
    reps: 0,
    nextReview: null,
  };
  await save(p);
}

export async function markHanziWrong(char) {
  // For backward compatibility: treat as score=0
  await markHanziReviewed(char, 0);
}

export async function markHanziLearned(char, points = 1) {
  // For backward compatibility: treat as good pass
  await markHanziReviewed(char, points >= 1 ? 1.0 : 0.7);
}

function isDue(entry) {
  if (!entry.nextReview) return true;
  return entry.nextReview <= todayISO();
}

// Get new (never learned) hanzi for a level, up to a limit
export async function getNewHanzi(level, hanziList, limit = DECK_CONFIG.newCardsPerDay) {
  const p = await getProgress();
  const chars = hanziList.filter(h => h.l === level);
  const newChars = chars.filter(h => {
    const s = p.hanzi[h.c];
    return !s || s.status === 'new';
  });
  // Return in random order, capped
  const shuffled = [...newChars].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

// Get due (scheduled for review) hanzi for a level, up to a limit
export async function getDueHanzi(level, hanziList, limit = DECK_CONFIG.maxReviewsPerDay) {
  const p = await getProgress();
  const chars = hanziList.filter(h => h.l === level);
  const due = chars.filter(h => {
    const s = p.hanzi[h.c];
    return s && s.status !== 'new' && isDue(s);
  });
  // Sort by interval (shorter intervals first = most urgent)
  due.sort((a, b) => {
    const sa = ensureSM2(p.hanzi[a.c]);
    const sb = ensureSM2(p.hanzi[b.c]);
    return (sa.interval || 0) - (sb.interval || 0);
  });
  return due.slice(0, limit);
}

// Build a combined session queue: new cards first (up to maxNewPerSession) then due reviews
// ponytail: daily new card limit uses a simple AsyncStorage counter. Upgrade: proper settings.
export async function getSessionCards(level, hanziList) {
  const p = await getProgress();
  const today = todayISO();

  // Count new cards reviewed today (reps===1 means first review happened today)
  let newToday = 0;
  for (const entry of Object.values(p.hanzi)) {
    if (entry.status === 'new' || !entry.nextReview) continue;
    // A card with reps===1 and nextReview===today was just learned today
    if (entry.reps === 1 && entry.nextReview === today) {
      newToday++;
    }
  }

  const remainingNew = Math.max(0, DECK_CONFIG.newCardsPerDay - newToday);
  const newCards = await getNewHanzi(level, hanziList, Math.min(DECK_CONFIG.maxNewPerSession, remainingNew));
  const dueCards = await getDueHanzi(level, hanziList, DECK_CONFIG.maxReviewsPerDay);

  if (DECK_CONFIG.newFirst) {
    return { newCards, dueCards, queue: [...newCards, ...dueCards] };
  } else {
    return { newCards, dueCards, queue: [...dueCards, ...newCards] };
  }
}

export async function markLevelComplete(level) {
  const p = await getProgress();
  p.levels[String(level)] = { completed: true };
  await save(p);
}

export async function isLevelComplete(level) {
  const p = await getProgress();
  return !!p.levels[String(level)]?.completed;
}

export async function getLevelStats(level, hanziList) {
  const p = await getProgress();
  const chars = hanziList.filter(h => h.l === level);
  let total = chars.length;
  let learned = 0;
  for (const h of chars) {
    const s = p.hanzi[h.c];
    if (s?.status === 'learned') learned++;
  }
  return { total, learned, pct: total ? Math.round(learned / total * 100) : 0 };
}