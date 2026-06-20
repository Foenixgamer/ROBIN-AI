const WAKE_RE = /\brobin\b/i;
const SILENCE_TIMEOUT = 800;
const SILENCE_THRESHOLD = 0.10;
const MIN_AUDIO_SIZE = 51200; // bytes — ignorar fragments < 50KB (solo voz real)
const MIN_SPEECH_MS = 800; // ms de voz sostenida antes de iniciar timer de silencio

console.log('[VOICE] voice.js cargado (MediaRecorder + Groq Whisper)');
console.log('[VOICE] window.Robin disponible:', !!window.Robin);

let mediaRecorder = null;
let audioStream = null;
let audioContext = null;
let audioAnalyser = null;
let amplitudeInterval = null;
let silenceTimer = null;
let audioChunks = [];
let isListening = true;
let userTextTimer = null;
let robinTextTimer = null;
let wakeStatusTimer = null;
let recording = false;
let speechDetected = false;
let speechStartTime = 0;
let ttsActive = false;

// ── Audio player para TTS ──
let audioPlayer = null;

// ── Silence detection with AudioContext + AnalyserNode ──

function startAmplitudeLoop() {
  amplitudeInterval = setInterval(() => {
    if (!audioAnalyser) return;
    const data = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const value = (data[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / data.length);

    const freqData = new Uint8Array(audioAnalyser.frequencyBinCount);
    audioAnalyser.getByteFrequencyData(freqData);
    let voiceEnergy = 0;
    let totalEnergy = 0;
    for (let i = 0; i < freqData.length; i++) {
      totalEnergy += freqData[i];
      if (i >= 2 && i <= 20) voiceEnergy += freqData[i];
    }
    const voiceRatio = totalEnergy > 0 ? voiceEnergy / totalEnergy : 0;
    const isSpeech = rms >= SILENCE_THRESHOLD && voiceRatio > 0.3;

    if (window.__setOrbAmplitude) {
      window.__setOrbAmplitude(Math.min(1, rms * 3));
    }

    if (isSpeech) {
      if (!speechDetected) {
        speechDetected = true;
        speechStartTime = Date.now();
      }
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    } else {
      if (speechDetected) {
        if ((Date.now() - speechStartTime) >= MIN_SPEECH_MS) {
          if (!silenceTimer) {
            silenceTimer = setTimeout(() => {
              if (mediaRecorder && mediaRecorder.state === 'recording') {
                stopAndTranscribe();
              }
            }, SILENCE_TIMEOUT);
          }
        }
      }
    }
  }, 50);
}

function stopAndTranscribe() {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  speechDetected = false;
  speechStartTime = 0;
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    const hint = document.getElementById('status-hint');
    if (hint) hint.textContent = 'PROCESANDO';
    mediaRecorder.stop();
  }
}

// ── MediaRecorder lifecycle ──

function startMediaRecorder() {
  audioChunks = [];
  mediaRecorder = new MediaRecorder(audioStream);
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
    }
  };
  mediaRecorder.onstop = () => processAudioChunk();
  mediaRecorder.start();
  console.log('[VOICE] MediaRecorder started');
}

async function processAudioChunk() {
  if (audioChunks.length === 0) {
    if (recording && isListening) startMediaRecorder();
    return;
  }

  if (ttsActive) {
    audioChunks = [];
    if (recording && isListening) startMediaRecorder();
    return;
  }

  const blob = new Blob(audioChunks, { type: 'audio/webm' });
  audioChunks = [];

  if (blob.size < MIN_AUDIO_SIZE) {
    if (recording && isListening) startMediaRecorder();
    return;
  }

  const reader = new FileReader();
  reader.onloadend = async () => {
    const base64 = reader.result.split(',')[1];

    try {
      const text = await window.Robin.transcribeAudio(base64);
      if (text && text.trim()) {
        processTranscribedText(text.trim());
      } else {
        const hint = document.getElementById('status-hint');
        if (hint) hint.textContent = 'ESCUCHANDO';
      }
    } catch (err) {
      console.error('[VOICE] Transcription error:', err);
      const hint = document.getElementById('status-hint');
      if (hint) hint.textContent = 'ESCUCHANDO';
    }

    if (recording && isListening) startMediaRecorder();
  };
  reader.readAsDataURL(blob);
}

// ── Wake word detection + command routing ──

function processTranscribedText(text) {
  console.log('[VOICE] Transcripción recibida:', text);
  showUserText(text);

  const isWake = WAKE_RE.test(text);
  const cleanText = text.replace(WAKE_RE, '').trim();

  if (!isWake && cleanText.length < 3) {
    return;
  }

  if (isWake) {
    const hint = document.getElementById('status-hint');
    if (hint) hint.textContent = 'TE ESCUCHO';
    if (wakeStatusTimer) clearTimeout(wakeStatusTimer);
    wakeStatusTimer = setTimeout(() => {
      const h = document.getElementById('status-hint');
      if (h) h.textContent = 'ESCUCHANDO';
    }, 1000);

    if (window.__setOrbMode) {
      window.__setOrbMode('WAKE');
      setTimeout(() => {
        if (window.__setOrbMode) window.__setOrbMode('LISTENING');
      }, 750);
    }

    if (!cleanText || cleanText.length < 2) {
      Robin.processCommand('saludo').catch((err) => {
        console.error('[VOICE] Wake error:', err);
      });
      return;
    }
  }

  Robin.processCommand(cleanText || text).catch((err) => {
    console.error('[VOICE] Command error:', err);
  });
}

// ── Start / Stop ──

async function startRecording() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    console.log('[VOICE] getUserMedia OK, tracks:', audioStream.getAudioTracks().length);

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioSource = audioContext.createMediaStreamSource(audioStream);
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 256;
    audioSource.connect(audioAnalyser);

    recording = true;
    startMediaRecorder();
    startAmplitudeLoop();

    if (window.__setOrbMode) window.__setOrbMode('LISTENING');
    const hint = document.getElementById('status-hint');
    if (hint) hint.textContent = 'ESCUCHANDO';
  } catch (err) {
    console.error('[VOICE] Error iniciando grabación:', err.message);
    const hint = document.getElementById('status-hint');
    if (hint) hint.textContent = 'MIC BLOQUEADO: ' + err.name;
  }
}

function stopRecording() {
  isListening = false;
  recording = false;
  if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
  if (wakeStatusTimer) clearTimeout(wakeStatusTimer);
  if (amplitudeInterval) { clearInterval(amplitudeInterval); amplitudeInterval = null; }
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    try { mediaRecorder.stop(); } catch (e) {}
    mediaRecorder = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  if (audioStream) {
    audioStream.getTracks().forEach(t => t.stop());
    audioStream = null;
  }
}

// ── Display ──

function showUserText(text) {
  const el = document.getElementById('user-text');
  if (!el) return;
  el.textContent = text;
  el.style.opacity = '1';
  if (userTextTimer) clearTimeout(userTextTimer);
  userTextTimer = setTimeout(() => {
    el.style.opacity = '0';
  }, 2500);
}

function showRobinText(text) {
  const el = document.getElementById('robin-text');
  if (!el) return;
  el.textContent = text;
  el.style.opacity = '1';
  if (robinTextTimer) clearTimeout(robinTextTimer);
  robinTextTimer = setTimeout(() => {
    el.style.opacity = '0';
  }, 4000);
}

let currentRobinText = '';

// ── Robin event handlers ──

if (window.Robin) {
  Robin.onRobinText((text) => {
    currentRobinText = text;
    const el = document.getElementById('robin-text');
    if (el) {
      el.textContent = text;
      el.style.opacity = '1';
    }
    if (robinTextTimer) {
      clearTimeout(robinTextTimer);
      robinTextTimer = null;
    }
  });

  Robin.onOrbMode((mode) => {
    const hint = document.getElementById('status-hint');
    if (!hint) return;
    if (mode === 'SPEAKING') hint.textContent = 'HABLANDO';
    else if (mode === 'ALERT') hint.textContent = '⚠ ALERTA';
    else if (mode === 'LISTENING' || mode === 'IDLE') hint.textContent = 'ESCUCHANDO';
  });

  Robin.onOrbSpeaking((isSpeaking) => {
    ttsActive = isSpeaking;
    if (isSpeaking) {
      audioChunks = [];
    }
    if (window.__setOrbMode) window.__setOrbMode(isSpeaking ? 'SPEAKING' : 'LISTENING');
    const hint = document.getElementById('status-hint');
    if (hint) hint.textContent = isSpeaking ? 'HABLANDO' : 'ESCUCHANDO';

    if (!isSpeaking && currentRobinText) {
      robinTextTimer = setTimeout(() => {
        const el = document.getElementById('robin-text');
        if (el) el.style.opacity = '0';
        currentRobinText = '';
      }, 1500);
    }
  });

  Robin.onAlertReceived((alert) => {
    if (window.__setOrbMode) window.__setOrbMode('ALERT');
    const hint = document.getElementById('status-hint');
    if (hint) hint.textContent = '⚠ ALERTA';
    showRobinText(alert.message || alert.title);
    showEmergencyBar();
  });

  Robin.onMenu(() => toggleMenu());

  Robin.onPlayAudio(({ base64, mimeType }) => {
    if (audioPlayer) {
      audioPlayer.pause();
      audioPlayer.src = '';
    }
    audioPlayer = new Audio();
    audioPlayer.src = `data:${mimeType};base64,${base64}`;
    audioPlayer.onended = () => {
      window.Robin.audioEnded();
      audioPlayer = null;
    };
    audioPlayer.onerror = (e) => {
      console.error('[VOICE] Audio playback error:', e);
      window.Robin.audioEnded();
      audioPlayer = null;
    };
    audioPlayer.play().catch((err) => {
      console.error('[VOICE] Audio play() failed:', err);
      window.Robin.audioEnded();
    });
  });
}

// ── Emergency bar ──

function showEmergencyBar() {
  const bar = document.getElementById('emergency-bar');
  if (bar) bar.classList.add('open');
  updateBarData();
}

function hideEmergency() {
  const bar = document.getElementById('emergency-bar');
  const panel = document.getElementById('emergency-panel');
  if (bar) bar.classList.remove('open');
  if (panel) {
    panel.classList.remove('open');
    panel.style.display = 'none';
  }
  if (window.__setOrbMode) window.__setOrbMode('IDLE');
  const hint = document.getElementById('status-hint');
  if (hint) hint.textContent = 'ESCUCHANDO';
}

function toggleEmergencyBar() {
  const bar = document.getElementById('emergency-bar');
  if (bar && bar.classList.contains('open')) {
    hideEmergency();
  } else {
    showEmergencyBar();
  }
}

async function updateBarData() {
  if (!window.Robin) return;
  try {
    const data = await Robin.getEmergencyData();
    const vpnDot = document.querySelector('#bar-vpn .dot');
    if (vpnDot) vpnDot.className = 'dot ' + (data.vpn ? 'green' : '');
    const scoreEl = document.getElementById('bar-score-val');
    if (scoreEl && data.securityScore !== undefined) {
      scoreEl.textContent = data.securityScore;
    }
  } catch (e) {}
}

let currentPanel = null;
function togglePanel(type) {
  const panel = document.getElementById('emergency-panel');
  if (!panel) return;
  if (currentPanel === type && panel.classList.contains('open')) {
    panel.classList.remove('open');
    setTimeout(() => { panel.style.display = 'none'; }, 350);
    currentPanel = null;
    return;
  }
  currentPanel = type;
  panel.style.display = 'block';

  if (type === 'vpn') renderVPNSection(panel);
  else if (type === 'net') renderNetSection(panel);
  else if (type === 'score') renderScoreSection(panel);

  setTimeout(() => panel.classList.add('open'), 10);
}

async function renderVPNSection(panel) {
  panel.innerHTML = `
    <div class="panel-title">◆ Conexión VPN</div>
    <div class="panel-row"><span class="label">Estado</span><span class="value">No disponible en escritorio</span></div>
    <div class="panel-close"><button onclick="hideEmergency()">Cerrar</button></div>
  `;
}

async function renderNetSection(panel) {
  let netInfo = {};
  if (window.Robin) {
    try { netInfo = await Robin.getNetworkInfo(); } catch (e) {}
  }
  panel.innerHTML = `
    <div class="panel-title">◆ Red</div>
    <div class="panel-row"><span class="label">Tipo</span><span class="value">${netInfo.type || '—'}</span></div>
    <div class="panel-row"><span class="label">WiFi</span><span class="value">${netInfo.wifiSsid || '—'}</span></div>
    <div class="panel-row"><span class="label">Online</span><span class="value ${netInfo.online ? 'green' : ''}">${netInfo.online ? '✅ Conectado' : '❌ Sin conexión'}</span></div>
    <div class="panel-close"><button onclick="hideEmergency()">Cerrar</button></div>
  `;
}

async function renderScoreSection(panel) {
  let stats = {};
  if (window.Robin) {
    try { stats = await Robin.getSystemStats(); } catch (e) {}
    try { stats.consciousness = await Robin.getEmergencyData(); } catch (e) {}
  }
  const cpu = stats.cpu?.load?.toFixed(1) || '—';
  const ram = stats.ram?.percent || '—';
  const uptime = stats.uptime ? Math.floor(stats.uptime / 3600) + 'h ' + Math.floor((stats.uptime % 3600) / 60) + 'm' : '—';
  const memCount = stats.consciousness?.memoryCount || 0;

  panel.innerHTML = `
    <div class="panel-title">◆ Sistema</div>
    <div class="panel-row"><span class="label">CPU</span><span class="value cyan">${cpu}%</span></div>
    <div class="panel-row"><span class="label">RAM</span><span class="value cyan">${ram}%</span></div>
    <div class="panel-row"><span class="label">Encendido</span><span class="value">${uptime}</span></div>
    <div class="panel-row"><span class="label">Recuerdos</span><span class="value cyan">${memCount}</span></div>
    <div class="panel-close"><button onclick="hideEmergency()">Cerrar</button></div>
  `;
}

// ── Menu overlay ──

let menuOpen = false;
let keyConfigOpen = false;

function toggleMenu() {
  const overlay = document.getElementById('menu-overlay');
  if (!overlay) return;
  if (menuOpen) {
    hideMenu();
  } else {
    showMainMenu();
    overlay.classList.add('open');
    menuOpen = true;
  }
}

function hideMenu() {
  const overlay = document.getElementById('menu-overlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  const keyConfig = document.getElementById('key-config');
  if (keyConfig) keyConfig.classList.remove('open');
  keyConfigOpen = false;
  menuOpen = false;
}

function showMainMenu() {
  const main = document.getElementById('menu-main');
  const keyConfig = document.getElementById('key-config');
  if (main) main.style.display = 'block';
  if (keyConfig) keyConfig.classList.remove('open');
  keyConfigOpen = false;
}

function showKeyConfig() {
  const main = document.getElementById('menu-main');
  const keyConfig = document.getElementById('key-config');
  if (main) main.style.display = 'none';
  if (keyConfig) {
    keyConfig.classList.add('open');
    keyConfigOpen = true;
  }
}

async function saveApiKeys() {
  const providers = [
    { id: 'key-anthropic', name: 'anthropic' },
    { id: 'key-google', name: 'google' },
    { id: 'key-openrouter', name: 'openrouter' },
    { id: 'key-groq', name: 'groq' },
  ];
  let saved = 0;
  for (const p of providers) {
    const input = document.getElementById(p.id);
    if (input && input.value.trim()) {
      try {
        await Robin.setApiKey(p.name, input.value.trim());
        saved++;
      } catch (e) {
        console.error(`Error saving ${p.name} key:`, e);
      }
    }
  }
  const status = document.getElementById('key-status');
  if (status) status.textContent = saved > 0 ? `${saved} clave(s) guardadas.` : 'No hay claves nuevas para guardar.';
  setTimeout(() => { if (status) status.textContent = ''; }, 3000);
}

function showSystemPanel() {
  hideMenu();
  showEmergencyBar();
  setTimeout(() => togglePanel('score'), 400);
}

function quitApp() {
  if (window.Robin && window.Robin.quit) {
    Robin.quit();
  }
}

function init() {
  startRecording();
}

document.addEventListener('DOMContentLoaded', init);
