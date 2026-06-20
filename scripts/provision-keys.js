// ════════════════════════════════════════════════
// ROBIN — PROVISIONING (one-time key setup)
// Run after app is built: node scripts/provision-keys.js
// ════════════════════════════════════════════════

const path = require('path');
const { app } = require('electron');

// This script must be run from within the Electron app context
// because it accesses the vault (keytar) and SQLite.

// Las keys se configuran desde la app vía menú → Configurar API Keys
const keys = {};

async function provision() {
  const { VaultManager } = require('../core/VaultManager');
  const vault = new VaultManager();
  await vault.init();

  for (const [key, value] of Object.entries(keys)) {
    try {
      await vault.save(key, value);
      console.log(`✓ ${key} stored`);
    } catch (e) {
      console.error(`✗ ${key} failed:`, e.message);
    }
  }

  console.log('\nProvisioning complete. Keys are stored in the vault.');
  process.exit(0);
}

provision().catch(err => {
  console.error('Provisioning failed:', err);
  process.exit(1);
});
