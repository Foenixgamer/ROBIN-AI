const Database = require('better-sqlite3');
const path = require('path');

const MEMORY_TYPES = {
  FACT: 'FACT',
  PREFERENCE: 'PREFERENCE',
  EVENT: 'EVENT',
  CONVERSATION: 'CONVERSATION',
  LEARNING: 'LEARNING',
};

class MemoryEngine {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'FACT',
        content TEXT NOT NULL,
        context TEXT DEFAULT '',
        importance REAL DEFAULT 0.5,
        tags TEXT DEFAULT '',
        timestamp INTEGER NOT NULL,
        expires_at INTEGER DEFAULT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
      CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories(tags);
    `);
    this.initLongTermMemory();
    this._startDecayLoop();
  }

  close() {
    if (this.db) this.db.close();
  }

  // ── Save ──
  saveMemory({ type = 'FACT', content, context = '', importance = 0.5, tags = '' }) {
    const now = Date.now();
    let ttl = null;
    if (importance < 0.3) ttl = now + 7 * 86400000;       // 7 days
    else if (importance < 0.7) ttl = now + 30 * 86400000;   // 30 days
    else ttl = now + 365 * 86400000;                         // 1 year

    const stmt = this.db.prepare(
      `INSERT INTO memories (type, content, context, importance, tags, timestamp, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(type, content, context, importance, tags, now, ttl);
  }

  // ── Recall (search by text, context, tags) ──
  recall(query, limit = 20) {
    const lower = query.toLowerCase();
    const words = lower.split(/\s+/).filter(w => w.length > 2);

    if (words.length === 0) return [];

    const conditions = words.map(() =>
      `(LOWER(content) LIKE ? OR LOWER(context) LIKE ? OR LOWER(tags) LIKE ?)`
    );
    const params = [];
    for (const w of words) {
      params.push(`%${w}%`, `%${w}%`, `%${w}%`);
    }

    const sql = `
      SELECT *, (${words.map(() => `(
        CASE WHEN LOWER(content) LIKE ? THEN 3 ELSE 0 END +
        CASE WHEN LOWER(context) LIKE ? THEN 2 ELSE 0 END +
        CASE WHEN LOWER(tags) LIKE ? THEN 2 ELSE 0 END
      )`).join(' + ')}) AS relevance
      FROM memories
      WHERE ${conditions.join(' AND ')}
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY (importance * 0.7 + (CAST(timestamp AS REAL) / 1000000000000) * 0.3) DESC
      LIMIT ?
    `;

    const searchParams = [...params];
    for (const w of words) {
      searchParams.push(`%${w}%`, `%${w}%`, `%${w}%`);
    }
    searchParams.push(Date.now(), limit);

    return this.db.prepare(sql).all(...searchParams);
  }

  // ── Get conversation summary for last N days ──
  getConversationSummary(days = 1) {
    const cutoff = Date.now() - days * 86400000;
    const rows = this.db.prepare(
      `SELECT content, timestamp FROM memories
       WHERE type = 'CONVERSATION' AND timestamp > ?
       ORDER BY timestamp ASC`
    ).all(cutoff);
    return rows.map(r => `[${new Date(r.timestamp).toLocaleString('es-MX')}] ${r.content}`).join('\n');
  }

  // ── Learn preference (from user statement) ──
  learnPreference(keyword, preference) {
    this.saveMemory({
      type: 'PREFERENCE',
      content: `${keyword}: ${preference}`,
      context: 'preference',
      importance: 0.8,
      tags: `preference,${keyword}`,
    });
  }

  // ── Getters ──
  getAll() {
    return this.db.prepare('SELECT * FROM memories ORDER BY timestamp DESC LIMIT 200').all();
  }

  getByType(type) {
    return this.db.prepare('SELECT * FROM memories WHERE type = ? ORDER BY timestamp DESC').all(type);
  }

  getRecent(limit = 50) {
    return this.db.prepare('SELECT * FROM memories ORDER BY timestamp DESC LIMIT ?').all(limit);
  }

  getMemoryCount() {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM memories').get();
    return row.count;
  }

  getTrustLevel() {
    const total = this.getMemoryCount();
    if (total === 0) return 0;
    const prefCount = this.db.prepare("SELECT COUNT(*) as count FROM memories WHERE type = 'PREFERENCE'").get().count;
    return Math.min(100, Math.round((prefCount / Math.max(total, 1)) * 50 + (total > 50 ? 50 : total)));
  }

  // ── Decay old memories ──
  _decayAndArchive() {
    const now = Date.now();
    this.db.prepare('DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < ?').run(now);
  }

  _startDecayLoop() {
    setInterval(() => this._decayAndArchive(), 3600000); // every hour
  }

  // ── SISTEMA 1: Memoria persistente (long_term_memory) ──

  initLongTermMemory() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS long_term_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        priority INTEGER DEFAULT 2,
        source TEXT DEFAULT 'user',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER DEFAULT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ltm_value ON long_term_memory(value);
      CREATE INDEX IF NOT EXISTS idx_ltm_priority ON long_term_memory(priority);
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  }

  saveUserFact(key, value, priority = 2) {
    if (!this.db) return;
    const now = Date.now();
    const existing = this.db.prepare('SELECT id FROM long_term_memory WHERE key = ?').get(key);
    if (existing) {
      this.db.prepare(
        'UPDATE long_term_memory SET value = ?, priority = ?, updated_at = ? WHERE key = ?'
      ).run(value, priority, now, key);
    } else {
      this.db.prepare(
        'INSERT INTO long_term_memory (key, value, priority, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(key, value, priority, 'user', now, now);
    }
  }

  getUserProfile() {
    if (!this.db) return {};
    const rows = this.db.prepare(
      'SELECT key, value FROM long_term_memory WHERE priority >= 2 ORDER BY priority DESC, updated_at DESC'
    ).all();
    const profile = {};
    for (const row of rows) {
      if (row.key === 'nombre') profile.nombre = row.value;
      else if (row.key === 'profesion') profile.profesion = row.value;
      else if (row.key.startsWith('proyecto_')) {
        if (!profile.proyectos) profile.proyectos = [];
        profile.proyectos.push(row.value);
      } else if (row.key.startsWith('interes_')) {
        if (!profile.intereses) profile.intereses = [];
        profile.intereses.push(row.value);
      } else {
        if (!profile.habitos) profile.habitos = [];
        profile.habitos.push(row.value);
      }
    }
    return profile;
  }

  trackTopic(topic) {
    if (!this.db) return;
    const now = Date.now();
    const existing = this.db.prepare('SELECT id, access_count FROM long_term_memory WHERE key = ?').get(`topic_${topic}`);
    if (existing) {
      const newCount = existing.access_count + 1;
      const newPriority = newCount >= 3 ? 2 : 1;
      this.db.prepare(
        'UPDATE long_term_memory SET access_count = ?, priority = ?, last_accessed = ? WHERE id = ?'
      ).run(newCount, newPriority, now, existing.id);
    } else {
      this.db.prepare(
        'INSERT INTO long_term_memory (key, value, priority, source, created_at, updated_at, access_count, last_accessed) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(`topic_${topic}`, topic, 1, 'topic', now, now, 1, now);
    }
  }

  pruneOldMemories() {
    if (!this.db) return;
    const cutoff = Date.now() - 30 * 86400000;
    this.db.prepare(
      'DELETE FROM long_term_memory WHERE priority = 1 AND last_accessed IS NOT NULL AND last_accessed < ?'
    ).run(cutoff);
  }

  recallRelevant(query, limit = 5) {
    if (!this.db) return [];
    const lower = query.toLowerCase().trim();
    const now = Date.now();
    let rows;
    if (lower) {
      rows = this.db.prepare(
        `SELECT * FROM long_term_memory WHERE LOWER(value) LIKE ?
         ORDER BY priority DESC, access_count DESC LIMIT ?`
      ).all(`%${lower}%`, limit);
    } else {
      rows = this.db.prepare(
        'SELECT * FROM long_term_memory ORDER BY priority DESC, access_count DESC LIMIT ?'
      ).all(limit);
    }
    for (const row of rows) {
      this.db.prepare(
        'UPDATE long_term_memory SET access_count = access_count + 1, last_accessed = ? WHERE id = ?'
      ).run(now, row.id);
    }
    return rows;
  }

  getConfig(key) {
    if (!this.db) return null;
    const row = this.db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : null;
  }

  setConfig(key, value) {
    if (!this.db) return;
    this.db.prepare(
      'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)'
    ).run(key, JSON.stringify(value));
  }
}

module.exports = { MemoryEngine, MEMORY_TYPES };
