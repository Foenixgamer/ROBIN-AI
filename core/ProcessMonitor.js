const si = require('systeminformation');

class ProcessMonitor {
  constructor() {
    this.onAlert = null;
    this.onUpdate = null;
    this._knownProcesses = new Map();
    this._alertCooldowns = new Map();
    this._COOLDOWN_MS = 300000;

    this._whitelist = new Set([
      'system', 'registry', 'smss.exe', 'csrss.exe',
      'wininit.exe', 'services.exe', 'lsass.exe',
      'svchost.exe', 'explorer.exe', 'taskmgr.exe',
      'chrome.exe', 'msedge.exe', 'code.exe',
      'node.exe', 'electron.exe', 'robin.exe'
    ]);

    this._suspiciousPatterns = [
      { pattern: /mimikatz/i, reason: 'Herramienta de robo de credenciales' },
      { pattern: /metasploit/i, reason: 'Framework de explotación' },
      { pattern: /cobalt.?strike/i, reason: 'Framework de C2' },
      { pattern: /\bnc\.exe$/i, reason: 'Netcat — posible backdoor' },
      { pattern: /meterpreter/i, reason: 'Shell reversa de Metasploit' },
      { pattern: /psexec/i, reason: 'Ejecución remota de comandos' },
      { pattern: /procdump/i, reason: 'Volcado de memoria de procesos' },
      { pattern: /wce\.exe/i, reason: 'Windows Credential Editor' },
      { pattern: /fgdump/i, reason: 'Extractor de hashes de Windows' },
      { pattern: /pwdump/i, reason: 'Extractor de contraseñas' },
    ];

    this._CPU_THRESHOLD = 80;
    this._MEM_THRESHOLD = 500;
  }

  async scan() {
    try {
      const { list } = await si.processes();
      const alerts = [];
      const snapshot = [];

      list.forEach(proc => {
        const name = proc.name || '';
        const lower = name.toLowerCase();

        if (this._whitelist.has(lower)) return;

        for (const { pattern, reason } of this._suspiciousPatterns) {
          if (pattern.test(name)) {
            const alertKey = `suspicious_${lower}`;
            if (!this._isOnCooldown(alertKey)) {
              alerts.push({
                type: 'suspicious_process',
                title: '🔴 Proceso sospechoso',
                message: `"${name}" detectado. ${reason}. PID: ${proc.pid}`,
                severity: 'critical',
                process: { name, pid: proc.pid, reason }
              });
              this._setCooldown(alertKey);
            }
            break;
          }
        }

        if (proc.cpu > this._CPU_THRESHOLD) {
          const alertKey = `highcpu_${proc.pid}`;
          if (!this._isOnCooldown(alertKey)) {
            alerts.push({
              type: 'high_cpu',
              title: 'Alto consumo de CPU',
              message: `"${name}" usa ${proc.cpu.toFixed(1)}% de CPU. Podría ser minería o bucle infinito.`,
              severity: 'warning',
              process: { name, pid: proc.pid, cpu: proc.cpu }
            });
            this._setCooldown(alertKey);
          }
        }

        const memMB = (proc.memRss || 0) / 1024 / 1024;
        if (memMB > this._MEM_THRESHOLD) {
          const alertKey = `highmem_${proc.pid}`;
          if (!this._isOnCooldown(alertKey)) {
            alerts.push({
              type: 'high_memory',
              title: 'Consumo elevado de memoria',
              message: `"${name}" usa ${memMB.toFixed(0)} MB de RAM.`,
              severity: 'info',
              process: { name, pid: proc.pid, memMB }
            });
            this._setCooldown(alertKey);
          }
        }

        snapshot.push({ name, pid: proc.pid, cpu: proc.cpu, mem: memMB.toFixed(1) });
      });

      alerts.forEach(alert => {
        if (this.onAlert) this.onAlert(alert);
      });

      if (this.onUpdate) {
        this.onUpdate({
          total: list.length,
          suspicious: alerts.filter(a => a.type === 'suspicious_process').length,
          topBycpu: snapshot.sort((a, b) => b.cpu - a.cpu).slice(0, 5)
        });
      }

      return { alerts, snapshot };
    } catch (err) {
      console.error('[PROC] Error en scan:', err.message);
      return { alerts: [], snapshot: [] };
    }
  }

  async killProcess(pid) {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      exec(`taskkill /PID ${pid} /F`, (err, stdout) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  _isOnCooldown(key) {
    const last = this._alertCooldowns.get(key) || 0;
    return (Date.now() - last) < this._COOLDOWN_MS;
  }

  _setCooldown(key) {
    this._alertCooldowns.set(key, Date.now());
  }
}

module.exports = { ProcessMonitor };
