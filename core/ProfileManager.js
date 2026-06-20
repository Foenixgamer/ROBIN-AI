const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class ProfileManager {
  constructor(db) {
    this.db = db;
    this.activeProfile = null;
    this._ensureTable();
    this._loadActiveProfile();
  }

  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rules TEXT NOT NULL,
        activated_at INTEGER
      );
    `);
    this._seedDefaultProfiles();
  }

  _seedDefaultProfiles() {
    const defaults = [
      {
        id: 'trabajo',
        name: 'Trabajo',
        rules: {
          volume: 40,
          notifications: 'important_only',
          blockedApps: ['steam.exe', 'spotify.exe'],
          networkMonitoring: 'high',
          autoLockMinutes: 15,
          vpnRecommended: true
        }
      },
      {
        id: 'casa',
        name: 'Casa',
        rules: {
          volume: 70,
          notifications: 'all',
          blockedApps: [],
          networkMonitoring: 'normal',
          autoLockMinutes: 30,
          vpnRecommended: false
        }
      },
      {
        id: 'noche',
        name: 'Noche',
        rules: {
          volume: 20,
          notifications: 'none',
          blockedApps: ['chrome.exe', 'msedge.exe', 'discord.exe', 'slack.exe'],
          networkMonitoring: 'high',
          autoLockMinutes: 10,
          muteNotifications: true,
          vpnRecommended: true
        }
      },
      {
        id: 'viaje',
        name: 'Viaje',
        rules: {
          volume: 50,
          notifications: 'important_only',
          blockedApps: [],
          networkMonitoring: 'maximum',
          autoLockMinutes: 5,
          vpnRecommended: true,
          threatAlerts: 'aggressive'
        }
      }
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO profiles (id, name, rules)
      VALUES (?, ?, ?)
    `);
    defaults.forEach(p => {
      stmt.run(p.id, p.name, JSON.stringify(p.rules));
    });
  }

  _loadActiveProfile() {
    const row = this.db.prepare(`
      SELECT * FROM profiles
      WHERE activated_at IS NOT NULL
      ORDER BY activated_at DESC LIMIT 1
    `).get();
    if (row) {
      this.activeProfile = { ...row, rules: JSON.parse(row.rules) };
    }
  }

  async activate(profileId) {
    const row = this.db.prepare('SELECT * FROM profiles WHERE id = ?').get(profileId);
    if (!row) return { success: false, error: `Perfil "${profileId}" no existe` };

    const profile = { ...row, rules: JSON.parse(row.rules) };
    const { rules } = profile;
    const applied = [];

    if (rules.volume !== undefined) {
      await this._setVolume(rules.volume);
      applied.push(`Volumen: ${rules.volume}%`);
    }

    if (rules.muteNotifications) {
      await this._setDoNotDisturb(true);
      applied.push('No molestar: activado');
    } else {
      await this._setDoNotDisturb(false);
    }

    if (rules.blockedApps?.length > 0) {
      for (const app of rules.blockedApps) {
        try {
          await execAsync(`taskkill /IM ${app} /F`);
          applied.push(`Cerrado: ${app}`);
        } catch (e) {}
      }
    }

    if (rules.autoLockMinutes) {
      await this._setScreenTimeout(rules.autoLockMinutes);
      applied.push(`Auto-bloqueo: ${rules.autoLockMinutes}min`);
    }

    this.db.prepare('UPDATE profiles SET activated_at = ? WHERE id = ?').run(Date.now(), profileId);
    this.activeProfile = profile;

    console.log('[PROFILE] Activado:', profile.name, applied);
    return { success: true, profile: profile.name, applied };
  }

  async _setVolume(percent) {
    const vol = Math.max(0, Math.min(100, percent));
    try {
      await execAsync(`nircmd.exe setsysvolume ${Math.round(vol * 655.35)}`);
    } catch {
      const script = `
        $vol = ${vol / 100};
        $steps = [int]($vol * 50);
        $wsh = New-Object -ComObject WScript.Shell;
        for ($i=0; $i -lt 50; $i++) { $wsh.SendKeys([char]174) }
        for ($i=0; $i -lt $steps; $i++) { $wsh.SendKeys([char]175) }
      `;
      await execAsync(
        `powershell -NoProfile -NonInteractive -Command "${script.replace(/\n/g,' ').replace(/"/g,'\\"')}"`,
        { timeout: 10000 }
      ).catch(() => {});
    }
  }

  async _setDoNotDisturb(enable) {
    const value = enable ? 1 : 0;
    await execAsync(
      `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings" /v "NOC_GLOBAL_SETTING_TOASTS_ENABLED" /t REG_DWORD /d ${value} /f`
    ).catch(() => {});
  }

  async _setScreenTimeout(minutes) {
    await execAsync(`powercfg /change monitor-timeout-ac ${minutes}`).catch(() => {});
  }

  getActiveProfile() {
    return this.activeProfile;
  }

  getAllProfiles() {
    return this.db.prepare('SELECT id, name FROM profiles').all();
  }
}

module.exports = { ProfileManager };
