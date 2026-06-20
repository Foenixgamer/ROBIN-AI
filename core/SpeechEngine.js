class SpeechEngine {
  constructor(groqApiKey) {
    if (!groqApiKey) {
      throw new Error('GROQ_API_KEY required for SpeechEngine');
    }
    this.groqKey = groqApiKey;
  }

  async transcribe(audioBase64) {
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const form = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/webm' });
    form.append('file', blob, 'audio.webm');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'es');
    form.append('response_format', 'text');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.groqKey}`,
      },
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq STT error ${res.status}: ${errText}`);
    }
    return await res.text();
  }
}

module.exports = { SpeechEngine };
