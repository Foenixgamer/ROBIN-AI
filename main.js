const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, Notification, session } = require('electron');
const path = require('path');
const fs = require('fs');

// ═══ SINGLE INSTANCE LOCK ═════════════════════
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', (event, commandLine, workingDir) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

// Cargar .env al inicio
(() => {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const m = line.trim().match(/^([^=]+)=(.+)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim();
      }
    }
  }
})();
const { MemoryEngine } = require('./core/MemoryEngine');
const { RobinBrain, MOODS } = require('./core/RobinBrain');
const { VoiceEngine } = require('./core/VoiceEngine');
const { SpeechEngine } = require('./core/SpeechEngine');
const { SystemController } = require('./core/SystemController');
const { Intelligence } = require('./core/Intelligence');
const { ActionEngine } = require('./core/ActionEngine');
const { NetworkMonitor } = require('./core/NetworkMonitor');
const { VaultManager } = require('./core/VaultManager');
const { VaultBackup } = require('./core/VaultBackup');
const { AutoStart } = require('./core/AutoStart');
const { ThreatIntelligence } = require('./core/ThreatIntelligence');
const { ProcessMonitor } = require('./core/ProcessMonitor');
const { TrafficLogger } = require('./core/TrafficLogger');
const { ProfileManager } = require('./core/ProfileManager');
const { AutomationEngine } = require('./core/AutomationEngine');
const { AlarmManager } = require('./core/AlarmManager');
const { VolumeController } = require('./core/VolumeController');

// Chromium flags for microphone access from file://
app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', 'file://');
app.commandLine.appendSwitch('allow-file-access-from-files');

let mainWindow = null;
let tray = null;
let memoryEngine = null;
let brain = null;
let voiceEngine = null;
let speechEngine = null;
let system = null;
let intel = null;
let actionEngine = null;
let networkMonitor = null;
let vault = null;
let vaultBackup = null;
let autoStart = null;
let threatIntel = null;
let processMonitor = null;
let trafficLogger = null;
let profileManager = null;
let automationEngine = null;
let alarmManager = null;
let volumeController = null;

const robinSpeak = (text) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('robin:text', text);
  }
  voiceEngine?.speak(text).catch(() => {});
};

const appState = {
  vpn: false,
  stealth: false,
  blocked: 0,
  securityScore: 100,
  commandCount: 0,
};

// ═══ WINDOW ═══════════════════════════════════

function createWindow() {
    const display = require('electron').screen.getPrimaryDisplay();
  mainWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    fullscreen: true,
    frame: false,
    transparent: false,
    backgroundColor: '#070A10',
    title: 'Robin',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      sandbox: false,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  // F12 toggle devtools manual
  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowed = ['media', 'microphone', 'audioCapture'];
      callback(allowed.includes(permission));
    }
  );

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray && !tray._hintShown) {
        try {
          tray.displayBalloon({
            title: 'Robin sigue activo',
            content: 'Robin está en la bandeja del sistema. Click para volver.',
          });
        } catch (_) {}
        tray._hintShown = true;
      }
    }
  });

  globalShortcut.register('Escape', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('keyboard:menu');
    }
  });

  globalShortcut.register('CommandOrControl+H', () => {
    app.isQuitting = true;
    app.quit();
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  tray = new Tray(trayIconPath);
  tray.setToolTip('Robin — Asistente de Seguridad');
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Mostrar Robin',
      click: () => { mainWindow?.show(); mainWindow?.focus(); }
    },
    {
      label: 'Ocultar',
      click: () => mainWindow?.hide()
    },
    { type: 'separator' },
    {
      label: 'Salir',
      click: () => { app.isQuitting = true; app.quit(); }
    },
  ]));
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

// ═══ CORE INIT ════════════════════════════════

async function initCore() {
  const dbPath = path.join(app.getPath('userData'), 'robin.db');
  memoryEngine = new MemoryEngine(dbPath);
  vault = new VaultManager();
  system = new SystemController();
  intel = new Intelligence();

  const { exec } = require('child_process');
  exec('python --version', (err, stdout, stderr) => {
    console.log('[INIT] python version:', stdout || stderr || err?.message);
  });
  exec('python -m edge_tts --version', (err, stdout, stderr) => {
    console.log('[INIT] edge-tts version:', stdout || stderr || err?.message);
  });
  voiceEngine = new VoiceEngine({
    onSpeakingChange: (isSpeaking) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('orb:speaking', isSpeaking);
      }
    },
  });

  // Conectar reproducción de audio al renderer
  voiceEngine.onPlayAudio = (base64, mimeType) => {
    console.log('[MAIN] onPlayAudio llamado, mimeType:', mimeType, 'base64 length:', base64?.length);
    return new Promise((resolve) => {
      if (!mainWindow || mainWindow.isDestroyed()) { resolve(); return; }
      mainWindow.webContents.send('audio:play', { base64, mimeType });
      const handler = () => {
        ipcMain.removeListener('audio:ended', handler);
        resolve();
      };
      ipcMain.once('audio:ended', handler);
      setTimeout(() => {
        ipcMain.removeListener('audio:ended', handler);
        resolve();
      }, 30000);
    });
  };

  const groqKey = await vault.get('GROQ_API_KEY') || process.env.ROBIN_GROQ_KEY;
  if (groqKey) {
    try {
      speechEngine = new SpeechEngine(groqKey);
      console.log('[INIT] SpeechEngine (Groq Whisper) initialized');
    } catch (e) {
      console.warn('[INIT] SpeechEngine init failed:', e.message);
    }
  }

  brain = new RobinBrain(memoryEngine, vault);
  networkMonitor = new NetworkMonitor();

  await memoryEngine.init();
  await vault.init();
  vaultBackup = new VaultBackup(vault);

  vaultBackup.autoBackup().then(r => {
    if (r.success) console.log('[VAULT] Auto-backup completado');
  });

  threatIntel = new ThreatIntelligence();
  processMonitor = new ProcessMonitor();
  trafficLogger = new TrafficLogger(memoryEngine.db);
  profileManager = new ProfileManager(memoryEngine.db);
  volumeController = new VolumeController();
  alarmManager = new AlarmManager(memoryEngine.db, robinSpeak);
  automationEngine = new AutomationEngine(memoryEngine.db, profileManager, robinSpeak);

  actionEngine = new ActionEngine(system, intel, memoryEngine, vault, brain, voiceEngine, threatIntel, processMonitor, trafficLogger, profileManager, alarmManager, automationEngine, volumeController, vaultBackup);

  // Conectar NetworkMonitor con TrafficLogger
  networkMonitor.onUpdate = (stats) => {
    trafficLogger.logSnapshot(stats);
  };

  networkMonitor.onAlert = (alert) => {
    trafficLogger.logAlert(alert);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('emergency:show', {
        title: alert.title || 'Alerta de red',
        message: alert.message,
        severity: alert.severity || 'warning',
      });
    }
  };
  networkMonitor.start();

  // Conectar ProcessMonitor
  processMonitor.onAlert = (alert) => {
    trafficLogger.logAlert(alert);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('emergency:show', alert);
    }
  };

  // Scan de procesos cada 30s
  setInterval(() => processMonitor.scan(), 30000);
  processMonitor.scan();

  // Actualizar blacklist desde URLhaus al iniciar
  threatIntel.updateFromURLhaus().then(result => {
    console.log('[INTEL] Blacklist actualizada:', result);
  });

  // Limpiar logs viejos al iniciar
  trafficLogger.pruneOldLogs();

  alarmManager.start();
  automationEngine.start();

  // Auto-provision keys from env vars (first run convenience)
  const envKeyMap = {
    ROBIN_OPENROUTER_KEY: 'OPENROUTER_API_KEY',
    ROBIN_GOOGLE_KEY: 'GOOGLE_API_KEY',
    ROBIN_GROQ_KEY: 'GROQ_API_KEY',
    ROBIN_ANTHROPIC_KEY: 'ANTHROPIC_API_KEY',
  };
  for (const [envVar, vaultKey] of Object.entries(envKeyMap)) {
    if (process.env[envVar]) {
      try {
        const existing = await vault.get(vaultKey);
        if (!existing) {
          await vault.save(vaultKey, process.env[envVar]);
          console.log(`✓ ${vaultKey} provisioned from env`);
        }
      } catch (e) { /* ignore */ }
    }
  }

  // Load Google API key for Safe Browsing
  try {
    const googleKey = await vault.get('GOOGLE_API_KEY');
    if (googleKey) {
      intel.setGoogleApiKey(googleKey);
    }
  } catch (e) {}

  // Awareness loop → renderer
  brain.startAwarenessLoop((msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('robin:text', msg);
    }
  });

}

// ═══ IPC HANDLERS ═════════════════════════════

ipcMain.handle('voice:start', () => voiceEngine.startListening());
ipcMain.handle('voice:stop', () => voiceEngine.stopListening());

ipcMain.handle('voice:process', async (_, text) => {
  console.log('[MAIN] voice:process recibido:', text);
  if (!text || !text.trim()) return { speak: '' };

  appState.commandCount++;

  try {
    const result = await actionEngine.process(text);
    const speak = result?.speak || '';

    // Manejar acciones especiales desde ActionEngine
    if (result.action === 'COPY_TO_CLIPBOARD' && result.data?.text) {
      const { clipboard } = require('electron');
      clipboard.writeText(result.data.text);
      setTimeout(() => {
        if (clipboard.readText() === result.data.text) clipboard.writeText('');
      }, 30000);
      sendToRenderer('robin:clipboard-copied', { message: 'Copiado al portapapeles' });
    }

    if (speak) {
      sendToRenderer('robin:text', speak);
      voiceEngine.speak(speak, (started) => {
        sendToRenderer('orb:mode', started ? 'SPEAKING' : 'LISTENING');
      }).catch(() => {});
    } else {
      sendToRenderer('orb:mode', 'LISTENING');
    }

    return result;
  } catch (err) {
    console.error('voice:process error:', err);
    return { speak: '' };
  }
});

ipcMain.handle('voice:transcribe', async (_, base64) => {
  if (!speechEngine) {
    console.error('[MAIN] voice:transcribe — SpeechEngine not initialized');
    return '';
  }
  try {
    const text = await speechEngine.transcribe(base64);
    console.log('[MAIN] voice:transcribe result:', text);
    return text;
  } catch (err) {
    console.error('[MAIN] voice:transcribe error:', err);
    return '';
  }
});

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

ipcMain.handle('voice:speak', async (_, text) => {
  voiceEngine.speak(text).catch(() => {});
});

ipcMain.handle('voice:wake', async () => {
  const hour = new Date().getHours();
  const userName = brain?.userName || 'Erick';
  let greet;
  if (hour >= 6 && hour < 12) {
    greet = ['Buenos días', 'Hola', 'Dime'][Math.floor(Math.random() * 3)];
  } else if (hour >= 12 && hour < 19) {
    greet = ['Buenas tardes', 'Hola', 'Dime'][Math.floor(Math.random() * 3)];
  } else if (hour >= 19 && hour < 23) {
    greet = ['Buenas noches', 'Hola', 'Dime'][Math.floor(Math.random() * 3)];
  } else {
    greet = ['Hola', 'Sí', 'Te escucho'][Math.floor(Math.random() * 3)];
  }
  const speak = `${greet} ${userName}.`;

  sendToRenderer('robin:text', speak);
  // Fire TTS async — orb already in LISTENING, TTS toggles SPEAKING via callback
  voiceEngine.speak(speak, (started) => {
    sendToRenderer('orb:mode', started ? 'SPEAKING' : 'LISTENING');
  }).catch(() => {});

  return { speak };
});

// ── System ──
ipcMain.handle('system:stats', async () => system.getStats());
ipcMain.handle('system:report', async () => system.getSystemReport());
ipcMain.handle('system:open', async (_, name) => system.openApp(name));
ipcMain.handle('system:volume', async (_, level) => volumeController?.setVolume(level) || system.setVolume(level));
ipcMain.handle('system:shutdown', async () => system.shutdown());
ipcMain.handle('system:lock', async () => system.lockWorkstation());

// ── Network ──
ipcMain.handle('network:info', () => networkMonitor.getNetworkInfo());
ipcMain.handle('network:publicip', async () => intel.getPublicIp());

// ── Vault (secrets / API keys) ──
ipcMain.handle('vault:save', async (_, { key, value }) => vault.save(key, value));
ipcMain.handle('vault:get', async (_, key) => vault.get(key));
ipcMain.handle('vault:list', async () => vault.list());
ipcMain.handle('vault:delete', async (_, key) => vault.delete(key));
ipcMain.handle('vault:generate', async (_, options) => vault.generatePassword(options));

// ── Vault (credential management) ──
ipcMain.handle('vault:credential-save', async (_, service, username, password, url, notes) => {
  return await vault.saveCredential(service, username, password, url, notes);
});
ipcMain.handle('vault:credential-get', async (_, service) => {
  return await vault.getCredentials(service);
});
ipcMain.handle('vault:credential-list', async () => {
  return await vault.listCredentials();
});
ipcMain.handle('vault:credential-delete', async (_, id) => {
  return await vault.deleteCredential(id);
});

// ── Vault Backup ──
ipcMain.handle('vault:export', async () => {
  return await vaultBackup.export();
});
ipcMain.handle('vault:import', async (_, filePath) => {
  return await vaultBackup.import(filePath);
});
ipcMain.handle('vault:backups', async () => {
  return vaultBackup.listBackups();
});

// ── Clipboard (auto-clear 30s) ──
ipcMain.handle('system:clipboard', async (_, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
  setTimeout(() => {
    if (clipboard.readText() === text) clipboard.writeText('');
  }, 30000);
  return { success: true };
});

// ── Intelligence ──
ipcMain.handle('intel:weather', async (_, city) => intel.getWeather(city));
ipcMain.handle('intel:threat', async (_, domain) => intel.investigateDomain(domain));
ipcMain.handle('intel:news', async () => intel.getSecurityNews());
ipcMain.handle('intel:breach', async (_, email) => intel.checkBreach(email));
ipcMain.handle('intel:google', async (_, query) => intel.googleThreatSearch(query));

// ── Memory ──
ipcMain.handle('memory:get', async () => memoryEngine.getAll());
ipcMain.handle('memory:save', async (_, data) => memoryEngine.saveMemory(data));
ipcMain.handle('memory:recall', async (_, query) => memoryEngine.recall(query));
ipcMain.handle('memory:conversation', async (_, days) => memoryEngine.getConversationSummary(days || 1));
ipcMain.handle('memory:count', async () => memoryEngine.getMemoryCount());
ipcMain.handle('memory:trust', async () => memoryEngine.getTrustLevel());

// ── Brain ──
ipcMain.handle('brain:think', async (_, input) => brain.think(input));
ipcMain.handle('brain:state', async () => brain.getState());
ipcMain.handle('brain:mood', async () => ({ mood: brain.mood, ...MOODS[brain.mood] }));

// ── API Keys ──
ipcMain.handle('apikey:set', async (_, { provider, key }) => {
  brain.setApiKey(provider, key);
  if (provider === 'google') intel.setGoogleApiKey(key);
  return { ok: true };
});

// ── Emergency Bar Data ──
ipcMain.handle('emergency:data', async () => ({
  vpn: appState.vpn,
  securityScore: appState.securityScore,
  blocked: appState.blocked,
  commandCount: appState.commandCount,
  memoryCount: memoryEngine?.getMemoryCount() || 0,
  trustLevel: memoryEngine?.getTrustLevel() || 0,
  hour: new Date().getHours(),
  minute: new Date().getMinutes(),
  isNight: new Date().getHours() < 6 || new Date().getHours() >= 22,
}));

// ── Notifications ──
ipcMain.handle('notification:show', async (_, { title, body }) => {
  new Notification({ title, body }).show();
});

// ── App ──
ipcMain.handle('app:quit', () => {
  app.isQuitting = true;
  app.quit();
});

// ── AutoStart ──
ipcMain.handle('system:autostart-toggle', async () => {
  const enabled = autoStart.toggle();
  return { enabled };
});
ipcMain.handle('system:autostart-status', async () => {
  return { enabled: autoStart.isEnabled() };
});

// ── Security ──
ipcMain.handle('security:threat-stats', async () => {
  return threatIntel.getStats();
});
ipcMain.handle('security:check-domain', async (_, domain) => {
  return { domain, blacklisted: threatIntel.isDomainBlacklisted(domain) };
});
ipcMain.handle('security:process-scan', async () => {
  return await processMonitor.scan();
});
ipcMain.handle('security:kill-process', async (_, pid) => {
  return await processMonitor.killProcess(pid);
});
ipcMain.handle('security:traffic-logs', async (_, hours) => {
  return trafficLogger.getRecentLogs(hours || 24);
});
ipcMain.handle('security:traffic-summary', async () => {
  return trafficLogger.getDailySummary();
});
ipcMain.handle('security:add-blacklist', async (_, entry, type) => {
  return threatIntel.addToBlacklist(entry, type);
});
ipcMain.handle('security:update-blacklist', async () => {
  return await threatIntel.updateFromURLhaus();
});

// ── Profiles ──
ipcMain.handle('profile:activate', async (_, profileId) => {
  return await profileManager.activate(profileId);
});
ipcMain.handle('profile:list', async () => {
  return profileManager.getAllProfiles();
});
ipcMain.handle('profile:current', async () => {
  return profileManager.getActiveProfile();
});

// ── Alarms ──
ipcMain.handle('alarm:create', async (_, { label, triggerAt, repeatType }) => {
  return alarmManager.create(label, triggerAt, repeatType);
});
ipcMain.handle('alarm:list', async () => {
  return alarmManager.list();
});
ipcMain.handle('alarm:cancel', async (_, id) => {
  alarmManager.cancel(id);
  return { ok: true };
});
ipcMain.handle('alarm:parse', async (_, text) => {
  return alarmManager.parseVoiceCommand(text);
});

// ── Automations ──
ipcMain.handle('automation:create', async (_, { name, triggerType, triggerValue, actionType, actionValue }) => {
  return automationEngine.create(name, triggerType, triggerValue, actionType, actionValue);
});
ipcMain.handle('automation:list', async () => {
  return automationEngine.list();
});
ipcMain.handle('automation:toggle', async (_, id) => {
  return automationEngine.toggle(id);
});

// ── Volume Controller ──
ipcMain.handle('volume:set', async (_, level) => {
  return await volumeController.setVolume(level);
});
ipcMain.handle('volume:mute', async () => {
  return await volumeController.mute();
});

// ═══ APP LIFECYCLE ════════════════════════════

app.whenReady().then(async () => {
  await initCore();
  autoStart = new AutoStart();
  createWindow();
  createTray();

  if (process.argv.includes('--hidden')) {
    mainWindow.hide();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  memoryEngine?.close();
  voiceEngine?.stopListening();
});
