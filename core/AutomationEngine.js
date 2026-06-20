class AutomationEngine {
  constructor(db, profileManager, onSpeak) {
    this.db = db;
    this.profileManager = profileManager;
    this.onSpeak = onSpeak;
    this._interval = null;
    this._firedToday = new Set();
    this._ensureTable();
  }

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_value TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_value TEXT,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER
      );
    `);
    this._seedDefaults();
  }

  _seedDefaults() {
    const defaults = [
      {
        name: 'Modo noche autom\u00e1tico',
        trigger_type: 'time',
        trigger_value: '23:00',
        action_type: 'set_profile',
        action_value: 'noche',
        enabled: 0
      },
      {
        name: 'Buenos d\u00edas',
        trigger_type: 'time',
        trigger_value: '07:00',
        action_type: 'speak',
        action_value: 'Buenos d\u00edas. Iniciando modo trabajo.',
        enabled: 0
      },
      {
        name: 'Recordatorio de descanso',
        trigger_type: 'interval',
        trigger_value: '60',
        action_type: 'speak',
        action_value: 'Llevas una hora trabajando. Es buen momento para descansar.',
        enabled: 0
      }
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO automations
        (name, trigger_type, trigger_value, action_type, action_value, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    defaults.forEach(a => {
      stmt.run(a.name, a.trigger_type, a.trigger_value, a.action_type, a.action_value, a.enabled, Date.now());
    });
  }

  start() {
    const resetAtMidnight = () => {
      const now = new Date();
      const msToMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
      setTimeout(() => {
        this._firedToday.clear();
        resetAtMidnight();
      }, msToMidnight);
    };
    resetAtMidnight();

    this._interval = setInterval(() => {
      this._check();
    }, 60000);

    console.log('[AUTO] AutomationEngine iniciado');
  }

  async _check() {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const automations = this.db.prepare('SELECT * FROM automations WHERE enabled = 1').all();

    for (const auto of automations) {
      await this._evaluate(auto, timeStr, now);
    }
  }

  async _evaluate(auto, timeStr, now) {
    const fireKey = `${auto.id}_${timeStr}`;

    if (auto.trigger_type === 'time') {
      if (auto.trigger_value === timeStr && !this._firedToday.has(fireKey)) {
        this._firedToday.add(fireKey);
        await this._execute(auto);
      }
    }

    if (auto.trigger_type === 'interval') {
      const intervalMin = parseInt(auto.trigger_value);
      if (now.getMinutes() % intervalMin === 0 && !this._firedToday.has(fireKey)) {
        this._firedToday.add(fireKey);
        await this._execute(auto);
      }
    }
  }

  async _execute(auto) {
    console.log('[AUTO] Ejecutando:', auto.name);
    switch (auto.action_type) {
      case 'set_profile':
        const result = await this.profileManager.activate(auto.action_value);
        if (this.onSpeak && result.success) {
          this.onSpeak(`Activando perfil ${result.profile} autom\u00e1ticamente.`);
        }
        break;
      case 'speak':
        if (this.onSpeak) {
          this.onSpeak(auto.action_value);
        }
        break;
      case 'lock_screen':
        const { exec } = require('child_process');
        exec('rundll32.exe user32.dll,LockWorkStation');
        break;
    }
  }

  create(name, triggerType, triggerValue, actionType, actionValue) {
    const stmt = this.db.prepare(`
      INSERT INTO automations (name, trigger_type, trigger_value, action_type, action_value, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);
    const result = stmt.run(name, triggerType, triggerValue, actionType, actionValue, Date.now());
    return result.lastInsertRowid;
  }

  list() {
    return this.db.prepare('SELECT * FROM automations ORDER BY created_at DESC').all();
  }

  toggle(id) {
    const auto = this.db.prepare('SELECT enabled FROM automations WHERE id = ?').get(id);
    if (!auto) return false;
    this.db.prepare('UPDATE automations SET enabled = ? WHERE id = ?').run(auto.enabled ? 0 : 1, id);
    return !auto.enabled;
  }
}

module.exports = { AutomationEngine };
