// ponytail: VocabularyService — paginated SQL queries, small result sets.
// Web: sql.js WASM. Mobile: expo-sqlite.

import { Platform } from 'react-native';

const DB_FILE = 'hsk_vocabulary.db';

class VocabularyService {
  #database = null;

  async initialize() {
    if (this.#database) return;
    if (Platform.OS === 'web') {
      await this.#initWeb();
    } else {
      await this.#initMobile();
    }
  }

  async #initWeb() {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs({ locateFile: (file) => '/' + file });
    const resp = await fetch('/' + DB_FILE);
    if (!resp.ok) throw new Error(`Failed to fetch DB: ${resp.status}`);
    const buf = await resp.arrayBuffer();
    this.#database = new SQL.Database(new Uint8Array(buf));
  }

  async #initMobile() {
    const FileSystem = require('expo-file-system');
    const Asset = require('expo-asset').Asset;
    const dbDir = FileSystem.documentDirectory + 'SQLite/';
    const dbPath = dbDir + DB_FILE;
    const dirInfo = await FileSystem.getInfoAsync(dbDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(dbDir, { intermediates: true });
    }
    const fileInfo = await FileSystem.getInfoAsync(dbPath);
    if (!fileInfo.exists) {
      const asset = Asset.fromModule(require('../assets/' + DB_FILE));
      await asset.downloadAsync();
      await FileSystem.copyAsync({ from: asset.localUri, to: dbPath });
    }
    const SQLite = require('expo-sqlite');
    this.#database = await SQLite.openDatabaseAsync(DB_FILE);
  }

  /** Run a query, normalise result shape across backends */
  async #query(sql, params = []) {
    if (!this.#database) throw new Error('VocabularyService not initialized');
    if (Platform.OS === 'web') {
      const stmt = this.#database.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    }
    return this.#database.getAllAsync(sql, params);
  }

  /** Run a query and return the first row (or null) */
  async #queryFirst(sql, params = []) {
    const rows = await this.#query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /** Run a query and return a single scalar value */
  async #queryValue(sql, params = []) {
    const row = await this.#queryFirst(sql, params);
    return row ? Object.values(row)[0] : null;
  }

  #parseLevel(dbLevel) {
    const match = String(dbLevel).match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }

  #levelWhereClause(level) {
    return `(wl.level = 'new-${level}' OR wl.level = 'newest-${level}' OR wl.level = 'old-${level}')`;
  }

  /**
   * Get words for an HSK level with pagination.
   * @param {number} level  - HSK level 1-7
   * @param {number} limit  - max results (default 50)
   * @param {number} offset - skip N results (default 0)
   * @returns {{ words: Array, total: number }}
   */
  async getWordsByLevel(level, limit = 50, offset = 0) {
    await this.initialize();
    const where = this.#levelWhereClause(level);

    const total = await this.#queryValue(
      `SELECT COUNT(DISTINCT w.id) FROM words w
       JOIN word_levels wl ON wl.word_id = w.id
       WHERE ${where}`
    );

    const rows = await this.#query(
      `SELECT w.simplified AS character, f.pinyin, m.meaning, wl.level, w.radical, w.frequency
       FROM words w
       JOIN forms f ON f.word_id = w.id
       JOIN meanings m ON m.form_id = f.id
       JOIN word_levels wl ON wl.word_id = w.id
       WHERE ${where}
       GROUP BY w.simplified
       ORDER BY w.frequency DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return {
      words: rows.map(row => ({
        character: row.character,
        pinyin: row.pinyin,
        meaning: row.meaning,
        level: this.#parseLevel(row.level),
        radical: row.radical || '',
        frequency: row.frequency || 0,
      })),
      total,
    };
  }

  /**
   * Look up a single character across all levels.
   * @returns {object|null}
   */
  async getWordByCharacter(character) {
    await this.initialize();
    const row = await this.#queryFirst(
      `SELECT w.simplified AS character, f.pinyin, m.meaning, wl.level, w.radical, w.frequency
       FROM words w
       JOIN forms f ON f.word_id = w.id
       JOIN meanings m ON m.form_id = f.id
       JOIN word_levels wl ON wl.word_id = w.id
       WHERE w.simplified = ?
       GROUP BY w.simplified
       LIMIT 1`,
      [character]
    );
    if (!row) return null;
    return {
      character: row.character,
      pinyin: row.pinyin,
      meaning: row.meaning,
      level: this.#parseLevel(row.level),
      radical: row.radical || '',
      frequency: row.frequency || 0,
    };
  }

  /**
   * Search words by pinyin or meaning, paginated.
   * @param {string} query
   * @param {number} limit
   * @param {number} offset
   * @returns {{ words: Array, total: number }}
   */
  async searchWords(query, limit = 50, offset = 0) {
    await this.initialize();
    const pattern = `%${query}%`;

    const total = await this.#queryValue(
      `SELECT COUNT(DISTINCT w.id) FROM words w
       JOIN forms f ON f.word_id = w.id
       JOIN meanings m ON m.form_id = f.id
       WHERE f.pinyin LIKE ? OR m.meaning LIKE ?`,
      [pattern, pattern]
    );

    const rows = await this.#query(
      `SELECT w.simplified AS character, f.pinyin, m.meaning, wl.level, w.radical, w.frequency
       FROM words w
       JOIN forms f ON f.word_id = w.id
       JOIN meanings m ON m.form_id = f.id
       JOIN word_levels wl ON wl.word_id = w.id
       WHERE f.pinyin LIKE ? OR m.meaning LIKE ?
       GROUP BY w.simplified
       ORDER BY w.frequency DESC
       LIMIT ? OFFSET ?`,
      [pattern, pattern, limit, offset]
    );

    return {
      words: rows.map(row => ({
        character: row.character,
        pinyin: row.pinyin,
        meaning: row.meaning,
        level: this.#parseLevel(row.level),
        radical: row.radical || '',
        frequency: row.frequency || 0,
      })),
      total,
    };
  }

  /**
   * Get the total word count for an HSK level.
   */
  async countWordsByLevel(level) {
    await this.initialize();
    return this.#queryValue(
      `SELECT COUNT(DISTINCT w.id) FROM words w
       JOIN word_levels wl ON wl.word_id = w.id
       WHERE ${this.#levelWhereClause(level)}`
    );
  }

  /**
   * Get all available numeric levels.
   * @returns {number[]}
   */
  async getLevels() {
    await this.initialize();
    const rows = await this.#query('SELECT DISTINCT level FROM word_levels');
    const levels = new Set();
    for (const row of rows) {
      const n = this.#parseLevel(row.level);
      if (n !== null) levels.add(n);
    }
    return [...levels].sort((a, b) => a - b);
  }
}

// Module-level singleton
let instance = null;
let initPromise = null;

export async function getVocabularyService() {
  if (instance) return instance;
  if (!initPromise) {
    initPromise = (async () => {
      const svc = new VocabularyService();
      await svc.initialize();
      instance = svc;
    })();
  }
  await initPromise;
  return instance;
}