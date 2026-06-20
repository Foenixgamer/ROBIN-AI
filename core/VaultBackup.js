const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

class VaultBackup {
  constructor(vaultManager) {
    this.vault = vaultManager;
    this.backupDir = path.join(
      app.getPath('userData'), 'vault-backups'
    );
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  // Exportar vault como archivo .robin.bak cifrado
  async export(outputPath) {
    await this.vault.init();

    const entries = await this.vault.listCredentials();
    const fullEntries = await Promise.all(
      entries.map(e => this.vault.getCredentialById(e.id))
    );

    const backupData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: fullEntries.filter(Boolean)
    };

    const json = JSON.stringify(backupData);

    const salt = crypto.randomBytes(32);
    const backupKey = crypto.scryptSync(
      this.vault._masterKey, salt, 32
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', backupKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(json, 'utf8'),
      cipher.final()
    ]);
    const authTag = cipher.getAuthTag();

    const magic = Buffer.from('ROBINBAK', 'ascii');
    const backupBuffer = Buffer.concat([magic, salt, iv, authTag, encrypted]);

    const finalPath = outputPath ||
      path.join(this.backupDir, `robin-vault-${Date.now()}.robin.bak`);

    fs.writeFileSync(finalPath, backupBuffer);
    console.log('[BACKUP] Exportado:', finalPath);
    return { success: true, path: finalPath, entries: fullEntries.length };
  }

  // Importar backup
  async import(filePath) {
    try {
      const backupBuffer = fs.readFileSync(filePath);

      const magic = backupBuffer.slice(0, 8).toString('ascii');
      if (magic !== 'ROBINBAK') {
        return { success: false, error: 'Archivo no es un backup v├ílido de Robin' };
      }

      const salt = backupBuffer.slice(8, 40);
      const iv = backupBuffer.slice(40, 56);
      const authTag = backupBuffer.slice(56, 72);
      const ciphertext = backupBuffer.slice(72);

      await this.vault.init();
      const backupKey = crypto.scryptSync(this.vault._masterKey, salt, 32);

      const decipher = crypto.createDecipheriv('aes-256-gcm', backupKey, iv);
      decipher.setAuthTag(authTag);

      const decrypted = decipher.update(ciphertext) + decipher.final('utf8');
      const backupData = JSON.parse(decrypted);

      let imported = 0;
      let skipped = 0;

      for (const entry of backupData.entries) {
        const existing = await this.vault.getCredentials(entry.service);
        const duplicate = existing.some(e => e.username === entry.username);

        if (!duplicate) {
          await this.vault.saveCredential(
            entry.service, entry.username,
            entry.password, entry.url || '', entry.notes || ''
          );
          imported++;
        } else {
          skipped++;
        }
      }

      console.log(`[BACKUP] Importado: ${imported} entradas, ${skipped} omitidas`);
      return { success: true, imported, skipped };
    } catch (e) {
      console.error('[BACKUP] Error al importar:', e.message);
      return { success: false, error: e.message };
    }
  }

  // Listar backups disponibles
  listBackups() {
    try {
      return fs.readdirSync(this.backupDir)
        .filter(f => f.endsWith('.robin.bak'))
        .map(f => {
          const fullPath = path.join(this.backupDir, f);
          const stat = fs.statSync(fullPath);
          return { name: f, path: fullPath, size: stat.size, createdAt: stat.birthtime };
        })
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) { return []; }
  }

  // Auto-backup semanal
  async autoBackup() {
    const backups = this.listBackups();
    const lastBackup = backups[0];
    const daysSince = lastBackup
      ? (Date.now() - lastBackup.createdAt) / 86400000
      : 999;

    if (daysSince >= 7) {
      const result = await this.export();
      console.log('[BACKUP] Auto-backup creado:', result.path);

      const allBackups = this.listBackups();
      if (allBackups.length >= 5) {
        allBackups.slice(4).forEach(b => {
          try { fs.unlinkSync(b.path); } catch (e) {}
        });
      }
      return result;
    }
    return { success: false, reason: 'Backup reciente existe' };
  }
}

module.exports = { VaultBackup };