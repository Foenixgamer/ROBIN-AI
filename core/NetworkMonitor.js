class NetworkMonitor {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.onAlert = null;
    this.onUpdate = null;
    this._lastStats = null;
    this._baseline = null;
    this._baselineSamples = [];
    this._BASELINE_SAMPLES = 10;
    this._alertCooldowns = new Map();
    this._COOLDOWN_MS = 60000;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[NET] NetworkMonitor iniciado');
    this.interval = setInterval(() => {
      this._update();
    }, 3000);
    this._update();
  }

  stop() {
    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async _update() {
    try {
      const si = require('systeminformation');
      const [netStats, netInterfaces, processes] = await Promise.all([
        si.networkStats(),
        si.networkInterfaces(),
        si.processes()
      ]);

      const stats = Array.isArray(netStats) ? netStats[0] : netStats;
      if (!stats) return;

      const current = {
        rx_sec: stats.rx_sec || 0,
        tx_sec: stats.tx_sec || 0,
        rx_bytes: stats.rx_bytes || 0,
        tx_bytes: stats.tx_bytes || 0,
        timestamp: Date.now()
      };

      if (this._baselineSamples.length < this._BASELINE_SAMPLES) {
        this._baselineSamples.push(current.rx_sec);
        if (this._baselineSamples.length === this._BASELINE_SAMPLES) {
          const avg = this._baselineSamples.reduce((a, b) => a + b, 0) / this._BASELINE_SAMPLES;
          this._baseline = {
            rxAvg: avg,
            rxSpikeThreshold: Math.max(avg * 10, 1024 * 1024),
            txSpikeThreshold: Math.max(avg * 5, 512 * 1024)
          };
          console.log('[NET] Baseline establecido:', JSON.stringify(this._baseline));
        }
      }

      if (this._baseline) {
        this._detectAnomalies(current, processes);
      }

      this._lastStats = current;

      if (this.onUpdate) {
        this.onUpdate({
          rxSpeed: current.rx_sec,
          txSpeed: current.tx_sec,
          rxTotal: current.rx_bytes,
          txTotal: current.tx_bytes,
          online: true
        });
      }
    } catch (err) {
      console.error('[NET] Error en _update:', err.message);
    }
  }

  _detectAnomalies(current, processes) {
    if (current.rx_sec > this._baseline.rxSpikeThreshold) {
      this._fireAlert('rx_spike', {
        title: 'Tráfico inusual detectado',
        message: `Descarga masiva: ${(current.rx_sec / 1024 / 1024).toFixed(2)} MB/s. Más de 10x el promedio normal.`,
        severity: 'warning'
      });
    }

    if (current.tx_sec > this._baseline.txSpikeThreshold) {
      this._fireAlert('tx_spike', {
        title: '⚠ Subida inusual de datos',
        message: `Tráfico de subida elevado: ${(current.tx_sec / 1024 / 1024).toFixed(2)} MB/s. Posible transferencia no autorizada.`,
        severity: 'critical'
      });
    }

    if (processes?.list) {
      this._checkSuspiciousProcesses(processes.list);
    }
  }

  _fireAlert(type, alert) {
    const now = Date.now();
    const lastFired = this._alertCooldowns.get(type) || 0;
    if (now - lastFired < this._COOLDOWN_MS) return;
    this._alertCooldowns.set(type, now);
    console.log('[NET] Alerta:', alert.title);
    if (this.onAlert) this.onAlert(alert);
  }

  _checkSuspiciousProcesses(processList) {
    const suspicious = ['mimikatz', 'metasploit', 'nmap', 'wireshark', 'netcat', 'nc.exe', 'psexec', 'cobalt', 'beacon.exe', 'meterpreter'];
    processList.forEach(proc => {
      const name = (proc.name || '').toLowerCase();
      if (suspicious.some(s => name.includes(s))) {
        this._fireAlert(`proc_${name}`, {
          title: '🔴 Proceso sospechoso detectado',
          message: `"${proc.name}" está activo. Este proceso es conocido en ataques.`,
          severity: 'critical'
        });
      }
    });
  }

  getLastStats() {
    return this._lastStats;
  }
}

module.exports = { NetworkMonitor };
