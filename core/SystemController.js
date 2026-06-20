const si = require('systeminformation');
const { exec } = require('child_process');
const { promisify } = require('util');
const os = require('os');

const execAsync = promisify(exec);

class SystemController {
  constructor() {
    this._statsCache = null;
    this._statsTime = 0;
  }

  async getStats() {
    // Cache for 5 seconds
    if (this._statsCache && (Date.now() - this._statsTime) < 5000) {
      return this._statsCache;
    }

    try {
      const [cpu, cpuTemp, mem, disk, osInfo, processes] = await Promise.all([
        si.currentLoad(),
        si.cpuTemperature(),
        si.mem(),
        si.fsSize(),
        si.osInfo(),
        si.processes(),
      ]);

      const stats = {
        cpu: {
          load: Math.round(cpu.currentLoad * 10) / 10,
          cores: cpu.cpus.length,
          temp: cpuTemp.main || null,
        },
        ram: {
          total: Math.round(mem.total / 1073741824 * 10) / 10,
          used: Math.round(mem.used / 1073741824 * 10) / 10,
          free: Math.round(mem.available / 1073741824 * 10) / 10,
          percent: Math.round((mem.used / mem.total) * 100),
        },
        disk: disk.length > 0 ? {
          total: Math.round(disk[0].size / 1073741824 * 10) / 10,
          used: Math.round(disk[0].used / 1073741824 * 10) / 10,
          free: Math.round((disk[0].size - disk[0].used) / 1073741824 * 10) / 10,
          percent: disk[0].use,
        } : null,
        os: {
          platform: osInfo.platform,
          distro: osInfo.distro,
          release: osInfo.release,
          hostname: osInfo.hostname,
          uptime: os.uptime(),
        },
        processes: {
          total: processes.all,
          running: processes.running,
        },
        hostname: os.hostname(),
        uptime: os.uptime(),
      };

      this._statsCache = stats;
      this._statsTime = Date.now();
      return stats;
    } catch (err) {
      console.error('System stats error:', err.message);
      return this._getFallbackStats();
    }
  }

  async getSystemReport() {
    const stats = await this.getStats();
    const parts = [];
    parts.push(`💻 ${stats.hostname}`);
    parts.push(`CPU: ${stats.cpu.load}% (${stats.cpu.cores} núcleos)`);
    parts.push(`RAM: ${stats.ram.used}GB / ${stats.ram.total}GB (${stats.ram.percent}%)`);
    if (stats.disk) parts.push(`Disco: ${stats.disk.used}GB / ${stats.disk.total}GB (${stats.disk.percent}%)`);
    parts.push(`Procesos: ${stats.processes.running} activos / ${stats.processes.total} totales`);
    const hrs = Math.floor(stats.uptime / 3600);
    const mins = Math.floor((stats.uptime % 3600) / 60);
    parts.push(`Encendido: ${hrs}h ${mins}m`);
    return parts.join(' · ');
  }

  async openApp(name) {
    const appMap = {
      'chrome': 'start chrome',
      'edge': 'start msedge',
      'firefox': 'start firefox',
      'explorer': 'start explorer',
      'cmd': 'start cmd',
      'terminal': 'start wt',
      'notepad': 'start notepad',
      'calculator': 'start calc',
      'spotify': 'start spotify',
      'vscode': 'start code',
      'settings': 'start ms-settings:',
      'bluetooth': 'start ms-settings:bluetooth',
      'wifi': 'start ms-settings:network-wifi',
    };

    const lower = name.toLowerCase().trim();
    const command = appMap[lower];

    if (command) {
      try {
        await execAsync(command, { timeout: 5000 });
        return { ok: true, message: `Abriendo ${name}` };
      } catch (err) {
        return { ok: false, message: `No pude abrir ${name}: ${err.message}` };
      }
    }

    // Try as direct executable name
    try {
      await execAsync(`start ${lower}`, { timeout: 5000 });
      return { ok: true, message: `Abriendo ${name}` };
    } catch (err) {
      return { ok: false, message: `No conozco la aplicación "${name}"` };
    }
  }

  async setVolume(level) {
    const clamped = Math.max(0, Math.min(100, level));
    try {
      await execAsync(
        `(New-Object -ComObject WScript.Shell).SendKeys([char]0xAF)`,
        { timeout: 3000 }
      );
      // Use nirCMD if available, otherwise PowerShell
      try {
        await execAsync(`nircmd setvolume ${clamped}`, { timeout: 3000 });
      } catch {
        await execAsync(
          `$obj = New-Object -ComObject WScript.Shell; ` +
          `for($i=0;$i -lt 50;$i++){ $obj.SendKeys([char]0xAE) }; ` +
          `for($i=0;$i -lt ${Math.floor(clamped/2)};$i++){ $obj.SendKeys([char]0xAF) }`,
          { timeout: 5000 }
        );
      }
      return { ok: true, level: clamped };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  async shutdown() {
    try {
      await execAsync('shutdown /s /t 10', { timeout: 3000 });
      return { ok: true, message: 'Apagando en 10 segundos' };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  async lockWorkstation() {
    try {
      await execAsync('rundll32.exe user32.dll,LockWorkStation', { timeout: 3000 });
      return { ok: true, message: 'Equipo bloqueado' };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  }

  _getFallbackStats() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return {
      cpu: { load: 0, cores: os.cpus().length, temp: null },
      ram: {
        total: Math.round(totalMem / 1073741824 * 10) / 10,
        used: Math.round((totalMem - freeMem) / 1073741824 * 10) / 10,
        free: Math.round(freeMem / 1073741824 * 10) / 10,
        percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      disk: null,
      os: {
        platform: process.platform,
        distro: 'Windows',
        release: os.release(),
        hostname: os.hostname(),
        uptime: os.uptime(),
      },
      processes: { total: 0, running: 0 },
      hostname: os.hostname(),
      uptime: os.uptime(),
    };
  }
}

module.exports = { SystemController };
