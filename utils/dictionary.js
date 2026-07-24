// ponytail: async dictionary with IndexedDB + streaming. No blocking.
// Ceiling: no progress bar. Upgrade: add download progress.

const DB_NAME = 'FuzhuLearnDict';
const STORE_NAME = 'index';
let dbPromise = null;
let streamPromise = null;

// Open IndexedDB (cached)
async function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (evt) => {
        const db = evt.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }
  return dbPromise;
}

// Get cached examples from IndexedDB
async function getFromDB(char) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(char);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

// Stream the dictionary file, build index, save to IndexedDB in batches
async function streamAndIndex() {
  if (streamPromise) return streamPromise;
  streamPromise = (async () => {
    try {
      const resp = await fetch('/data/en-zh_dictionary.txt');
      if (!resp.ok) throw new Error('Failed to fetch dictionary');
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      const db = await openDB();
      let buffer = '';
      let batch = [];
      const BATCH_SIZE = 1000;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process lines in buffer
        let lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Save incomplete line

        for (const line of lines) {
          if (!line.trim()) continue;
          const [en, zh] = line.split('\t');
          if (!en || !zh) continue;
          for (const char of zh) {
            batch.push({ char, zh, en });
            if (batch.length >= BATCH_SIZE) {
              await saveBatch(db, batch);
              batch = [];
            }
          }
        }
      }

      // Save remaining batch
      if (batch.length > 0) {
        await saveBatch(db, batch);
      }
    } catch (err) {
      console.error('Stream failed:', err);
    }
  })();
  return streamPromise;
}

// Save a batch of entries to IndexedDB
// ponytail: get-merge-put pattern. Two transactions to avoid race.
async function saveBatch(db, batch) {
  // Group by char
  const byChar = {};
  for (const { char, zh, en } of batch) {
    if (!byChar[char]) byChar[char] = [];
    byChar[char].push({ zh, en });
  }
  
  // Get all existing data first
  const chars = Object.keys(byChar);
  const existing = {};
  await Promise.all(chars.map(char => 
    new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(char);
      req.onsuccess = () => { existing[char] = req.result || []; resolve(); };
      req.onerror = () => { resolve(); };
    })
  ));
  
  // Merge and put
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const char of chars) {
      const merged = [...existing[char], ...byChar[char]];
      store.put(merged, char);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Main export: get usage examples for a character
// Returns a Promise that resolves when data is available
export function getUsageExamples(char) {
  // Try IndexedDB first
  return getFromDB(char).then(cached => {
    if (cached) return cached;

    // Start streaming in background if not already started
    streamAndIndex();

    // Poll DB until data appears or stream completes
    return new Promise(resolve => {
      let attempts = 0;
      const maxAttempts = 150; // ~30 seconds max
      const iv = setInterval(async () => {
        const data = await getFromDB(char);
        if (data) {
          clearInterval(iv);
          resolve(data);
        } else if (++attempts >= maxAttempts) {
          clearInterval(iv);
          resolve([]); // No data found
        }
      }, 200);
    });
  });
}
