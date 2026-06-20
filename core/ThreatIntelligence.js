const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ThreatIntelligence {
  constructor() {
    this.dataDir = path.join(app.getPath('userData'), 'threat-intel');
    this.blacklistFile = path.join(this.dataDir, 'blacklist.json');
    this.blacklist = {
      domains: new Set(),
      ips: new Set(),
      lastUpdated: null
    };
    this._ensureDir();
    this._loadFromDisk();
  }

  _ensureDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  _loadFromDisk() {
    try {
      if (fs.existsSync(this.blacklistFile)) {
        const data = JSON.parse(fs.readFileSync(this.blacklistFile, 'utf8'));
        this.blacklist.domains = new Set(data.domains || []);
        this.blacklist.ips = new Set(data.ips || []);
        this.blacklist.lastUpdated = data.lastUpdated;
        console.log('[INTEL] Blacklist cargada:', this.blacklist.domains.size, 'dominios,', this.blacklist.ips.size, 'IPs');
      } else {
        this._seedBuiltinList();
      }
    } catch (e) {
      console.error('[INTEL] Error cargando blacklist:', e.message);
      this._seedBuiltinList();
    }
  }

  _seedBuiltinList() {
    const builtinDomains = [
      'malware.wicar.org',
      'eicar.org',
      'testphp.vulnweb.com',
      'crimeflare.com',
      'zeustracker.abuse.ch'
    ];
    const builtinIPs = [
      '185.220.101.0', '185.220.102.0',
      '45.142.212.0', '194.165.16.0'
    ];
    builtinDomains.forEach(d => this.blacklist.domains.add(d));
    builtinIPs.forEach(ip => this.blacklist.ips.add(ip));
    this._saveToDisk();
    console.log('[INTEL] Lista semilla cargada');
  }

  _saveToDisk() {
    const data = {
      domains: [...this.blacklist.domains],
      ips: [...this.blacklist.ips],
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(this.blacklistFile, JSON.stringify(data, null, 2));
  }

  async updateFromURLhaus() {
    try {
      console.log('[INTEL] Actualizando desde URLhaus...');
      const res = await fetch('https://urlhaus.abuse.ch/downloads/text_online/', { timeout: 15000 });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const urls = text.split('\n').filter(line => !line.startsWith('#') && line.trim()).slice(0, 5000);
      let added = 0;
      urls.forEach(url => {
        try {
          const hostname = new URL(url).hostname;
          if (!this.blacklist.domains.has(hostname)) {
            this.blacklist.domains.add(hostname);
            added++;
          }
        } catch (e) {}
      });
      this._saveToDisk();
      console.log(`[INTEL] URLhaus: +${added} dominios. Total: ${this.blacklist.domains.size}`);
      return { added, total: this.blacklist.domains.size };
    } catch (err) {
      console.error('[INTEL] URLhaus falló:', err.message);
      return { added: 0, error: err.message };
    }
  }

  isDomainBlacklisted(domain) {
    if (!domain) return false;
    const d = domain.toLowerCase();
    if (this.blacklist.domains.has(d)) return true;
    const parts = d.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join('.');
      if (this.blacklist.domains.has(parent)) return true;
    }
    return false;
  }

  isIPBlacklisted(ip) {
    return this.blacklist.ips.has(ip);
  }

  addToBlacklist(entry, type = 'domain') {
    if (type === 'domain') {
      this.blacklist.domains.add(entry.toLowerCase());
    } else {
      this.blacklist.ips.add(entry);
    }
    this._saveToDisk();
    return true;
  }

  removeFromBlacklist(entry, type = 'domain') {
    if (type === 'domain') {
      this.blacklist.domains.delete(entry.toLowerCase());
    } else {
      this.blacklist.ips.delete(entry);
    }
    this._saveToDisk();
    return true;
  }

  getStats() {
    return {
      domains: this.blacklist.domains.size,
      ips: this.blacklist.ips.size,
      lastUpdated: this.blacklist.lastUpdated
    };
  }
}

module.exports = { ThreatIntelligence };
