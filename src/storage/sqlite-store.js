import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

function getDefaultDbPath() {
  if (process.env.SQLITE_DB_PATH) {
    return process.env.SQLITE_DB_PATH === ':memory:' ? ':memory:' : path.resolve(process.env.SQLITE_DB_PATH);
  }
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return ':memory:';
  }
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'csrep-uploader', 'data.sqlite');
  }
  return path.resolve('./data.sqlite');
}

export class SqliteStore {
  /**
   * @param {string} [dbPath] Path to SQLite database file or ':memory:'
   */
  constructor(dbPath) {
    this.dbPath = dbPath || getDefaultDbPath();

    if (this.dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(this.dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(this.dbPath);

    if (this.dbPath !== ':memory:') {
      try {
        this.db.pragma('journal_mode = WAL');
      } catch {}
    }

    this.init();
  }

  /**
   * Initialize tables and indexes
   */
  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        faceit_id TEXT,
        map TEXT,
        score TEXT,
        is_win INTEGER,
        demo_size INTEGER,
        status TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
      CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches(created_at);
    `);

    // Ensure error column exists if migrating from older schema
    // Ensure migration columns exist
    try {
      const columns = this.db.pragma('table_info(matches)').map(c => c.name);
      if (columns.length > 0 && !columns.includes('error')) {
        this.db.exec('ALTER TABLE matches ADD COLUMN error TEXT;');
      }
      if (columns.length > 0 && !columns.includes('rank')) {
        this.db.exec('ALTER TABLE matches ADD COLUMN rank INTEGER;');
      }
      if (columns.length > 0 && !columns.includes('date')) {
        this.db.exec('ALTER TABLE matches ADD COLUMN date TEXT;');
      }
      if (columns.length > 0 && !columns.includes('source')) {
        this.db.exec('ALTER TABLE matches ADD COLUMN source TEXT;');
      }
    } catch {}
    return this;
  }

  /**
   * Insert or update a match record
   * @param {Object} match
   */
  upsertMatch(match) {
    if (!match) throw new Error('Match object is required');
    const id = match.id || match.csrepMatchId || match.matchId;
    if (!id) throw new Error('Match id is required');

    const faceit_id = match.faceit_id !== undefined ? match.faceit_id : (match.faceitId !== undefined ? match.faceitId : null);
    const map = match.map !== undefined ? match.map : (match.mapName !== undefined ? match.mapName : null);
    const score = match.score !== undefined && match.score !== null ? String(match.score) : null;

    let is_win = null;
    if (typeof match.is_win !== 'undefined' && match.is_win !== null) {
      is_win = match.is_win ? 1 : 0;
    } else if (typeof match.isWin !== 'undefined' && match.isWin !== null) {
      is_win = match.isWin ? 1 : 0;
    }

    const demo_size = match.demo_size !== undefined && match.demo_size !== null
      ? Number(match.demo_size)
      : (match.demoSize !== undefined && match.demoSize !== null ? Number(match.demoSize) : null);

    const status = match.status || 'missing';
    const error = match.error !== undefined ? match.error : null;
    const rank = match.rank !== undefined ? (match.rank !== null ? Number(match.rank) : null) : null;
    const date = match.date !== undefined ? match.date : null;
    const source = match.source !== undefined ? match.source : null;

    const stmt = this.db.prepare(`
      INSERT INTO matches (id, faceit_id, map, score, is_win, demo_size, status, error, rank, date, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        faceit_id = COALESCE(excluded.faceit_id, matches.faceit_id),
        map = COALESCE(excluded.map, matches.map),
        score = COALESCE(excluded.score, matches.score),
        is_win = COALESCE(excluded.is_win, matches.is_win),
        demo_size = COALESCE(excluded.demo_size, matches.demo_size),
        status = COALESCE(excluded.status, matches.status),
        error = excluded.error,
        rank = COALESCE(excluded.rank, matches.rank),
        date = COALESCE(excluded.date, matches.date),
        source = COALESCE(excluded.source, matches.source),
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(id, faceit_id, map, score, is_win, demo_size, status, error, rank, date, source);
    return this.getMatch(id);
  }

  /**
   * Get a single match by id
   * @param {string} id
   */
  getMatch(id) {
    if (!id) return null;
    const row = this.db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
    return row || null;
  }

  /**
   * Get match by ID (alias for getMatch)
   * @param {string} id
   * @returns {Object|null}
   */
  getMatchById(id) {
    return this.getMatch(id);
  }

  /**
   * Check if a match exists
   * @param {string} id
   * @returns {boolean}
   */
  hasMatch(id) {
    if (!id) return false;
    const row = this.db.prepare('SELECT 1 FROM matches WHERE id = ? LIMIT 1').get(id);
    return Boolean(row);
  }

  /**
   * Update match status and optional error
   * @param {string} id
   * @param {string} status
   * @param {string|null} [error]
   * @returns {boolean}
   */
  updateMatchStatus(id, status, error = null) {
    if (!id) return false;
    const stmt = this.db.prepare(`
      UPDATE matches
      SET status = ?, error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const res = stmt.run(status, error, id);
    return res.changes > 0;
  }

  /**
   * Query matches with optional filter
   * @param {Object|string} [filter]
   * @returns {Array}
   */
  getMatches(filter = {}) {
    const whereClauses = [];
    const params = [];

    if (typeof filter === 'string') {
      whereClauses.push('status = ?');
      params.push(filter);
    } else if (filter && typeof filter === 'object') {
      if (filter.status) {
        if (Array.isArray(filter.status)) {
          if (filter.status.length > 0) {
            const placeholders = filter.status.map(() => '?').join(', ');
            whereClauses.push(`status IN (${placeholders})`);
            params.push(...filter.status);
          }
        } else {
          whereClauses.push('status = ?');
          params.push(filter.status);
        }
      }

      if (filter.map) {
        whereClauses.push('map = ?');
        params.push(filter.map);
      }

      if (typeof filter.is_win !== 'undefined' && filter.is_win !== null) {
        whereClauses.push('is_win = ?');
        params.push(filter.is_win ? 1 : 0);
      } else if (typeof filter.isWin !== 'undefined' && filter.isWin !== null) {
        whereClauses.push('is_win = ?');
        params.push(filter.isWin ? 1 : 0);
      }

      if (filter.search) {
        whereClauses.push('(id LIKE ? OR faceit_id LIKE ? OR map LIKE ?)');
        const term = `%${filter.search}%`;
        params.push(term, term, term);
      }
    }

    let sql = 'SELECT * FROM matches';
    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    const allowedOrderCols = ['date', 'created_at', 'updated_at', 'id', 'map', 'score', 'is_win', 'demo_size', 'status'];
    const orderBy = (filter?.orderBy && allowedOrderCols.includes(filter.orderBy)) ? filter.orderBy : 'COALESCE(date, created_at)';
    const order = (filter?.order && filter.order.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

    sql += ` ORDER BY ${orderBy} ${order}`;

    if (filter?.limit && Number.isInteger(Number(filter.limit))) {
      sql += ' LIMIT ?';
      params.push(Number(filter.limit));
      if (filter?.offset && Number.isInteger(Number(filter.offset))) {
        sql += ' OFFSET ?';
        params.push(Number(filter.offset));
      }
    }

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get stats overview
   * @returns {{ total: number, uploaded: number, missing: number, failed: number }}
   */
  getStats() {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('uploaded', 'done') THEN 1 ELSE 0 END) AS uploaded,
        SUM(CASE WHEN status IN ('missing', 'pending') THEN 1 ELSE 0 END) AS missing,
        SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) AS failed
      FROM matches
    `).get();

    return {
      total: row?.total || 0,
      uploaded: row?.uploaded || 0,
      missing: row?.missing || 0,
      failed: row?.failed || 0,
    };
  }

  /**
   * Get setting value by key
   * @param {string} key
   * @param {*} [defaultVal=null]
   */
  getSetting(key, defaultVal = null) {
    if (!key) return defaultVal;
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row || row.value === undefined || row.value === null) {
      return defaultVal;
    }
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  /**
   * Save setting value by key
   * @param {string} key
   * @param {*} val
   */
  setSetting(key, val) {
    if (!key) throw new Error('Setting key is required');
    const valueToStore = JSON.stringify(val);
    const stmt = this.db.prepare(`
      INSERT INTO settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(key, valueToStore);
    return val;
  }

  /**
   * Delete setting
   * @param {string} key
   */
  deleteSetting(key) {
    if (!key) return false;
    const res = this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
    return res.changes > 0;
  }

  /**
   * Delete match by id
   * @param {string} id
   */
  deleteMatch(id) {
    if (!id) return false;
    const res = this.db.prepare('DELETE FROM matches WHERE id = ?').run(id);
    return res.changes > 0;
  }

  /**
   * Clear all matches
   */
  clearMatches() {
    this.db.prepare('DELETE FROM matches').run();
  }

  /**
   * Close the database connection
   */
  close() {
    if (this.db && this.db.open) {
      this.db.close();
    }
  }
}

export default SqliteStore;
