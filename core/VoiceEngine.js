const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);

class VoiceEngine {
  constructor(opts = {}) {
    this.listening = false;
    this.onResult = null;
    this.onSpeakingChange = opts.onSpeakingChange || null;
    this.onPlayAudio = null;
    this.voice = 'es-MX-DaliaNeural';
    this.voiceBackup = 'es-ES-ElviraNeural';
    this.rate = '+0%';
    this.pitch = '+0Hz';
    this.ttsQueue = [];
    this.speaking = false;
    this.tempDir = path.join(require('os').tmpdir(), 'robin-tts');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  // ── TTS via edge-tts ──
  async speak(text, onStateChange) {
    this.ttsQueue.push({ text, onStateChange });
    if (!this.speaking) {
      await this._processQueue();
    }
  }

  async _processQueue() {
    this.speaking = true;
    if (this.onSpeakingChange) this.onSpeakingChange(true);
    while (this.ttsQueue.length > 0) {
      const item = this.ttsQueue.shift();
      if (item.onStateChange) item.onStateChange(true);
      await this._speakSingle(item.text);
      if (item.onStateChange) item.onStateChange(false);
    }
    this.speaking = false;
    if (this.onSpeakingChange) this.onSpeakingChange(false);
  }

  async _speakSingle(text) {
    console.log('[TTS] _speakSingle llamado con:', text.substring(0, 50));
    const escaped = this._escapeText(text);
    const mp3 = path.join(this.tempDir, `robin_${Date.now()}.mp3`);
    console.log('[TTS] tempDir:', this.tempDir);
    console.log('[TTS] mp3 path:', mp3);

    // Generar MP3 con edge-tts
    try {
      console.log('[TTS] Ejecutando edge-tts...');
      await execAsync(
        `python -m edge_tts --voice "${this.voice}" --text "${escaped}" --write-media "${mp3}" --rate=${this.rate} --pitch=${this.pitch}`,
        { timeout: 30000 }
      );
      console.log('[TTS] edge-tts OK, archivo existe:', fs.existsSync(mp3), 'tamaño:', fs.existsSync(mp3) ? fs.statSync(mp3).size : 0);
    } catch (err) {
      console.error('[TTS] edge-tts FALLÓ:', err.message);
      // Fallback: SAPI solo para generar WAV
      try {
        const wav = mp3.replace('.mp3', '.wav');
        await execAsync(
          `powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SetOutputToWaveFile('${wav}'); $s.Speak('${escaped}'); $s.Dispose();"`,
          { timeout: 30000 }
        );
        fs.renameSync(wav, mp3);
      } catch (e) {
        console.error('SAPI WAV generation also failed:', e.message);
        return;
      }
    }

    // Verificar que el archivo existe y tiene contenido
    if (!fs.existsSync(mp3) || fs.statSync(mp3).size < 100) {
      console.error('TTS output file missing or empty');
      return;
    }

    // Leer como base64 y enviar al renderer para reproducción
    const audioBase64 = fs.readFileSync(mp3).toString('base64');
    const mimeType = mp3.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';

    if (this.onPlayAudio) {
      await this.onPlayAudio(audioBase64, mimeType);
    }

    try { fs.unlinkSync(mp3); } catch (e) {}
  }

  _escapeText(text) {
    return text
      .replace(/'/g, "''")
      .replace(/"/g, '\\"')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '')
      .trim();
  }

  // STT handled entirely by renderer (Web Speech API).
  // These are just signaling stubs for main process compatibility.
  startListening() {
    this.listening = true;
  }

  stopListening() {
    this.listening = false;
  }

  // ── Prosody setters ──
  setProsody(rate, pitch) {
    this.rate = rate;
    this.pitch = pitch;
  }

  // ── Mood-based prosody ──
  setProsodyForMood(mood) {
    switch (mood) {
      case 'ALERTA':
        this.rate = '+20%';
        this.pitch = '+0Hz';
        break;
      case 'SATISFECHO':
        this.rate = '-10%';
        this.pitch = '+30Hz';
        break;
      case 'CURIOSO':
        this.rate = '-5%';
        this.pitch = '+20Hz';
        break;
      case 'PREOCUPADO':
        this.rate = '-15%';
        this.pitch = '-20Hz';
        break;
      case 'NEUTRAL':
      default:
        this.rate = '+0%';
        this.pitch = '+0Hz';
        break;
    }
  }

  dispose() {
    this.stopListening();
    this.ttsQueue = [];
  }
}

module.exports = { VoiceEngine };
