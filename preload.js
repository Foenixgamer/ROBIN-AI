const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Robin', {
  // ── Voice ──
  startListening: () => ipcRenderer.invoke('voice:start'),
  stopListening: () => ipcRenderer.invoke('voice:stop'),
  processCommand: (text) => ipcRenderer.invoke('voice:process', text),
  speak: (text) => ipcRenderer.invoke('voice:speak', text),
  wake: () => ipcRenderer.invoke('voice:wake'),
  transcribeAudio: (base64) => ipcRenderer.invoke('voice:transcribe', base64),

  // ── System ──
  getSystemStats: () => ipcRenderer.invoke('system:stats'),
  openApp: (name) => ipcRenderer.invoke('system:open', name),
  setVolume: (level) => ipcRenderer.invoke('system:volume', level),
  shutdown: () => ipcRenderer.invoke('system:shutdown'),
  lock: () => ipcRenderer.invoke('system:lock'),

  // ── Network ──
  getNetworkInfo: () => ipcRenderer.invoke('network:info'),
  getPublicIP: () => ipcRenderer.invoke('network:publicip'),

  // ── Vault (secrets / API keys) ──
  saveCredential: (key, value) => ipcRenderer.invoke('vault:save', { key, value }),
  getCredential: (key) => ipcRenderer.invoke('vault:get', key),
  listCredentials: () => ipcRenderer.invoke('vault:list'),
  deleteCredential: (key) => ipcRenderer.invoke('vault:delete', key),
  generatePassword: (options) => ipcRenderer.invoke('vault:generate', options),

  // ── Vault (credential management) ──
  saveCredentialEntry: (service, username, password, url, notes) =>
    ipcRenderer.invoke('vault:credential-save', service, username, password, url, notes),
  getCredentialsByService: (service) => ipcRenderer.invoke('vault:credential-get', service),
  listCredentialEntries: () => ipcRenderer.invoke('vault:credential-list'),
  deleteCredentialEntry: (id) => ipcRenderer.invoke('vault:credential-delete', id),

  // ── Vault Backup ──
  exportVault: () => ipcRenderer.invoke('vault:export'),
  importVault: (filePath) => ipcRenderer.invoke('vault:import', filePath),
  listBackups: () => ipcRenderer.invoke('vault:backups'),

  // ── Clipboard ──
  copyToClipboard: (text) => ipcRenderer.invoke('system:clipboard', text),

  // ── Intelligence ──
  getWeather: (city) => ipcRenderer.invoke('intel:weather', city),
  investigateDomain: (domain) => ipcRenderer.invoke('intel:threat', domain),
  getSecurityNews: () => ipcRenderer.invoke('intel:news'),
  checkBreach: (email) => ipcRenderer.invoke('intel:breach', email),

  // ── Memory ──
  getMemories: () => ipcRenderer.invoke('memory:get'),
  saveMemory: (data) => ipcRenderer.invoke('memory:save', data),
  recallMemory: (query) => ipcRenderer.invoke('memory:recall', query),
  getConversationSummary: (days) => ipcRenderer.invoke('memory:conversation', days),
  getMemoryCount: () => ipcRenderer.invoke('memory:count'),
  getTrustLevel: () => ipcRenderer.invoke('memory:trust'),

  // ── Brain ──
  think: (input) => ipcRenderer.invoke('brain:think', input),
  getBrainState: () => ipcRenderer.invoke('brain:state'),
  getMood: () => ipcRenderer.invoke('brain:mood'),

  // ── API Keys ──
  setApiKey: (provider, key) => ipcRenderer.invoke('apikey:set', { provider, key }),

  // ── Google Intelligence ──
  googleThreatSearch: (query) => ipcRenderer.invoke('intel:google', query),

  // ── System Report ──
  getSystemReport: () => ipcRenderer.invoke('system:report'),

  // ── Emergency Bar ──
  getEmergencyData: () => ipcRenderer.invoke('emergency:data'),

  // ── Notifications ──
  showNotification: (title, body) => ipcRenderer.invoke('notification:show', { title, body }),

  // ── Security (red, procesos, blacklist) ──
  checkDomain: (domain) => ipcRenderer.invoke('security:check-domain', domain),
  getProcessScan: () => ipcRenderer.invoke('security:process-scan'),
  killProcess: (pid) => ipcRenderer.invoke('security:kill-process', pid),
  getTrafficLogs: (hours) => ipcRenderer.invoke('security:traffic-logs', hours),
  getTrafficSummary: () => ipcRenderer.invoke('security:traffic-summary'),
  getThreatStats: () => ipcRenderer.invoke('security:threat-stats'),
  addToBlacklist: (entry, type) => ipcRenderer.invoke('security:add-blacklist', entry, type),
  updateBlacklist: () => ipcRenderer.invoke('security:update-blacklist'),

  // ── Profile Manager ──
  activateProfile: (profileId) => ipcRenderer.invoke('profile:activate', profileId),
  listProfiles: () => ipcRenderer.invoke('profile:list'),
  getCurrentProfile: () => ipcRenderer.invoke('profile:current'),

  // ── Alarms ──
  createAlarm: (label, triggerAt, repeatType) => ipcRenderer.invoke('alarm:create', { label, triggerAt, repeatType }),
  listAlarms: () => ipcRenderer.invoke('alarm:list'),
  cancelAlarm: (id) => ipcRenderer.invoke('alarm:cancel', id),
  parseAlarmCommand: (text) => ipcRenderer.invoke('alarm:parse', text),

  // ── Automations ──
  createAutomation: (name, triggerType, triggerValue, actionType, actionValue) =>
    ipcRenderer.invoke('automation:create', { name, triggerType, triggerValue, actionType, actionValue }),
  listAutomations: () => ipcRenderer.invoke('automation:list'),
  toggleAutomation: (id) => ipcRenderer.invoke('automation:toggle', id),

  // ── Volume Controller ──
  setVolumeExact: (level) => ipcRenderer.invoke('volume:set', level),
  muteVolume: () => ipcRenderer.invoke('volume:mute'),

  // ── Generic IPC invoke ──
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // ── Events (main → renderer) ──
  onOrbMode: (cb) => ipcRenderer.on('orb:mode', (_e, mode) => cb(mode)),
  onOrbSpeaking: (cb) => ipcRenderer.on('orb:speaking', (_e, isSpeaking) => cb(isSpeaking)),
  onRobinText: (cb) => ipcRenderer.on('robin:text', (_e, text) => cb(text)),
  onAlertReceived: (cb) => ipcRenderer.on('emergency:show', (_e, data) => cb(data)),
  onMenu: (cb) => ipcRenderer.on('keyboard:menu', () => cb()),
  quit: () => ipcRenderer.invoke('app:quit'),

  // ── Audio playback (main → renderer) ──
  onPlayAudio: (cb) => ipcRenderer.on('audio:play', (_e, data) => cb(data)),
  audioEnded: () => ipcRenderer.send('audio:ended'),

  // ── Remove listeners ──
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
