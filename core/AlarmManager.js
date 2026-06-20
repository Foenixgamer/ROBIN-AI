class AlarmManager {
  constructor(db, onSpeak) {
    this.db = db;
    this.onSpeak = onSpeak;
    this._interval = null;
    this._ensureTable();
  }

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alarms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        trigger_at INTEGER NOT NULL,
        repeat_type TEXT DEFAULT 'none',
        fired INTEGER DEFAULT 0,
        created_at INTEGER
      );
    `);
  }

  start() {
    this._interval = setInterval(() => {
      this._checkAlarms();
    }, 30000);
    this._checkAlarms();
    console.log('[ALARM] AlarmManager iniciado');
  }

  async _checkAlarms() {
    const now = Date.now();
    const due = this.db.prepare('SELECT * FROM alarms WHERE trigger_at <= ? AND fired = 0').all(now);

    for (const alarm of due) {
      console.log('[ALARM] Disparando:', alarm.label);

      this.db.prepare('UPDATE alarms SET fired = 1 WHERE id = ?').run(alarm.id);

      if (this.onSpeak) {
        this.onSpeak(alarm.label);
      }

      const { exec } = require('child_process');
      exec(
        `powershell -NoProfile -Command "` +
        `[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]| Out-Null; ` +
        `$t = [Windows.Data.Xml.Dom.XmlDocument,Windows.Data.Xml.Dom,ContentType=WindowsRuntime]::new(); ` +
        `$t.LoadXml('<toast><visual><binding template=\\"ToastGeneric\\"><text>Robin</text><text>${alarm.label.replace(/"/g,"'")}</text></binding></visual></toast>'); ` +
        `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Robin').Show([Windows.UI.Notifications.ToastNotification]::new($t));"`,
        { timeout: 5000 }
      );

      if (alarm.repeat_type === 'daily') {
        this.db.prepare('UPDATE alarms SET trigger_at = ?, fired = 0 WHERE id = ?').run(alarm.trigger_at + 86400000, alarm.id);
      }
    }
  }

  create(label, triggerAt, repeatType = 'none') {
    const stmt = this.db.prepare(`
      INSERT INTO alarms (label, trigger_at, repeat_type, created_at)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(label, triggerAt, repeatType, Date.now());
    return result.lastInsertRowid;
  }

  parseVoiceCommand(text) {
    const lower = text.toLowerCase();
    const now = new Date();

    const timeMatch = lower.match(/a las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!timeMatch) return null;

    let hours = parseInt(timeMatch[1]);
    const minutes = parseInt(timeMatch[2] || '0');
    const ampm = timeMatch[3];

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    const triggerDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

    if (triggerDate.getTime() <= Date.now()) {
      triggerDate.setDate(triggerDate.getDate() + 1);
    }

    const label = text
      .replace(/(?:pon|crea|activa|recu\u00e9rdame|alarma)/gi, '')
      .replace(timeMatch[0], '')
      .replace(/\s+/g, ' ')
      .trim() || 'Recordatorio de Robin';

    return {
      label,
      triggerAt: triggerDate.getTime(),
      triggerDate,
      repeatType: /diario|cada d\u00eda|todos los d\u00edas/i.test(lower) ? 'daily' : 'none'
    };
  }

  list() {
    return this.db.prepare("SELECT * FROM alarms WHERE fired = 0 OR repeat_type != 'none' ORDER BY trigger_at ASC").all();
  }

  cancel(id) {
    this.db.prepare('DELETE FROM alarms WHERE id = ?').run(id);
  }
}

module.exports = { AlarmManager };
