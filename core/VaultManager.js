const keytar = require('keytar');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SERVICE = 'robin-desktop';
const KEY_ACCOUNT = 'vault-master-key';
const VAULT_FILE = path.join(
  app.getPath('userData'), 'vault.enc'
);
const KEY_FILE = path.join(
  app.getPath('userData'), '.vault-master'
);

class VaultManager {
  constructor() {
    this._masterKey = null;
    this._vault = null;
    this._initialized = false;
  }

  // ── Inicializaci├│n ──

  async init() {
    if (this._initialized) return;
    this._masterKey = await this._getOrCreateMasterKey();
    await this._loadVault();
    this._initialized = true;
    console.log('[VAULT] Inicializado. Secretos:', Object.keys(this._vault.secrets || {}).length, 'Credenciales:', Object.keys(this._vault.entries || {}).length);
  }

  // ── Master Key (AES-256) ──

  async _getOrCreateMasterKey() {
    try {
      const stored = await keytar.getPassword(SERVICE, KEY_ACCOUNT);
      if (stored) return Buffer.from(stored, 'hex');
    } catch (e) {
      console.warn('[VAULT] keytar no disponible:', e.message);
    }

    if (fs.existsSync(KEY_FILE)) {
      try {
        const key = fs.readFileSync(KEY_FILE);
        if (key.length === 32) return key;
      } catch (e) {}
    }

    const newKey = crypto.randomBytes(32);

    try {
      await keytar.setPassword(SERVICE, KEY_ACCOUNT, newKey.toString('hex'));
      console.log('[VAULT] Master key guardada en keytar');
    } catch (e) {
      fs.writeFileSync(KEY_FILE, newKey, { mode: 0o600 });
      console.log('[VAULT] Master key guardada en archivo');
    }

    return newKey;
  }

  // ── Cifrado AES-256-GCM correcto (iv + authTag + ciphertext) ──

  _encrypt(plaintext) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this._masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  _decrypt(encryptedBase64) {
    const data = Buffer.from(encryptedBase64, 'base64');
    if (data.length < 33) throw new Error('Datos cifrados inv├ílidos');
    const iv = data.slice(0, 16);
    const authTag = data.slice(16, 32);
    const ciphertext = data.slice(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this._masterKey, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  }

  // ── Vault en disco ──

  async _loadVault() {
    if (!fs.existsSync(VAULT_FILE)) {
      this._vault = { secrets: {}, entries: {}, version: 2 };
      return;
    }
    try {
      const raw = fs.readFileSync(VAULT_FILE, 'utf8');
      const decrypted = this._decrypt(raw);
      this._vault = JSON.parse(decrypted);
      if (!this._vault.secrets) this._vault.secrets = {};
      if (!this._vault.entries) this._vault.entries = {};
    } catch (e) {
      console.error('[VAULT] No se pudo descifrar vault:', e.message);
      try { fs.copyFileSync(VAULT_FILE, VAULT_FILE + '.corrupted.' + Date.now()); } catch (_) {}
      this._vault = { secrets: {}, entries: {}, version: 2 };
    }
  }

  _saveVault() {
    const json = JSON.stringify(this._vault);
    const encrypted = this._encrypt(json);
    fs.writeFileSync(VAULT_FILE, encrypted, { mode: 0o600 });
  }

  // ═══════════════════════════════════════
  // API LEGACY (para API keys ├║ RobinBrain)
  // ═══════════════════════════════════════

  async save(key, value) {
    await this.init();
    if (!key || typeof key !== 'string') return { ok: false, message: 'key requerida' };
    this._vault.secrets[key] = String(value);
    this._saveVault();
    return { ok: true, key };
  }

  async get(key) {
    await this.init();
    if (!key) return null;

    if (this._vault.secrets && key in this._vault.secrets) {
      return this._vault.secrets[key];
    }

    const lower = key.toLowerCase();
    for (const [k, v] of Object.entries(this._vault.secrets || {})) {
      if (k.toLowerCase() === lower) return v;
    }
    return null;
  }

  async list() {
    await this.init();
    return Object.keys(this._vault.secrets || {}).filter(k => !k.startsWith('_'));
  }

  async delete(key) {
    await this.init();
    delete this._vault.secrets[key];
    this._saveVault();
    return { ok: true };
  }

  // ═══════════════════════════════════════
  // API DE CREDENCIALES (nueva)
  // ═══════════════════════════════════════

  async saveCredential(service, username, password, url = '', notes = '') {
    await this.init();
    const id = `${service.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    this._vault.entries[id] = {
      id, service, username, password, url, notes,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this._saveVault();
    return { success: true, id };
  }

  async getCredentials(service) {
    await this.init();
    const lower = (service || '').toLowerCase();
    if (!lower) return [];
    return Object.values(this._vault.entries || {}).filter(e =>
      e.service.toLowerCase().includes(lower)
    );
  }

  async getCredentialById(id) {
    await this.init();
    return this._vault.entries[id] || null;
  }

  async listCredentials() {
    await this.init();
    return Object.values(this._vault.entries || {}).map(({ id, service, username, url, notes, createdAt }) => ({
      id, service, username, url, notes, createdAt
    }));
  }

  async updateCredential(id, changes) {
    await this.init();
    if (!this._vault.entries[id]) return { success: false, error: 'No encontrado' };
    this._vault.entries[id] = {
      ...this._vault.entries[id],
      ...changes,
      updatedAt: Date.now()
    };
    this._saveVault();
    return { success: true };
  }

  async deleteCredential(id) {
    await this.init();
    if (!this._vault.entries[id]) return { success: false, error: 'No encontrado' };
    delete this._vault.entries[id];
    this._saveVault();
    return { success: true };
  }

  countCredentials() {
    return Object.keys(this._vault?.entries || {}).length;
  }

  // ── Generador de contrase├▒as seguro ──

  generatePassword(options = {}) {
    const config = typeof options === 'number' ? { length: options } : options;
    const {
      length = 20,
      uppercase = true,
      lowercase = true,
      numbers = true,
      symbols = true
    } = config;

    let chars = '';
    if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
    if (numbers) chars += '0123456789';
    if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
    if (!chars) chars = 'abcdefghijklmnopqrstuvwxyz';

    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    let password = '';
    for (let i = 0; i < length; i++) password += chars[array[i] % chars.length];

    if (uppercase && !/[A-Z]/.test(password)) {
      const pos = crypto.randomBytes(1)[0] % length;
      password = password.substring(0, pos) +
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[crypto.randomBytes(1)[0] % 26] +
        password.substring(pos + 1);
    }
    return password;
  }
}

module.exports = { VaultManager };