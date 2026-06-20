class TrafficLogger {
  constructor(db) {
    this.db = db;
    this._ensureTable();
  }

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS traffic_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        rx_bytes INTEGER DEFAULT 0,
        tx_bytes INTEGER DEFAULT 0,
        rx_speed REAL DEFAULT 0,
        tx_speed REAL DEFAULT 0,
        alert_type TEXT,
        alert_message TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_traffic_ts ON traffic_logs(timestamp);
    `);
  }

  logSnapshot(stats) {
    const stmt = this.db.prepare(`
      INSERT INTO traffic_logs (timestamp, rx_bytes, tx_bytes, rx_speed, tx_speed)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(Date.now(), stats.rxTotal || 0, stats.txTotal || 0, stats.rxSpeed || 0, stats.txSpeed || 0);
  }

  logAlert(alert) {
    const stmt = this.db.prepare(`
      INSERT INTO traffic_logs (timestamp, alert_type, alert_message)
      VALUES (?, ?, ?)
    `);
    stmt.run(Date.now(), alert.title, alert.message);
    console.log('[TRAFFIC] Alerta guardada:', alert.title);
  }

  getRecentLogs(hours = 24) {
    const since = Date.now() - (hours * 3600000);
    return this.db.prepare(`
      SELECT * FROM traffic_logs WHERE timestamp > ? ORDER BY timestamp DESC LIMIT 100
    `).all(since);
  }

  getDailySummary() {
    const since = Date.now() - 86400000;
    const stats = this.db.prepare(`
      SELECT COUNT(*) as samples, MAX(rx_speed) as peakRx, MAX(tx_speed) as peakTx, COUNT(alert_type) as alerts
      FROM traffic_logs WHERE timestamp > ?
    `).get(since);
    return stats;
  }

  pruneOldLogs() {
    const cutoff = Date.now() - (7 * 86400000);
    const result = this.db.prepare('DELETE FROM traffic_logs WHERE timestamp < ?').run(cutoff);
    console.log('[TRAFFIC] Logs antiguos eliminados:', result.changes);
  }
}

module.exports = { TrafficLogger };
