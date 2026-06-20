class EmotionDetector {
  detectEmotion(userInput) {
    const lower = userInput.toLowerCase();

    const patterns = {
      FRUSTRADO: [
        'estoy harto', 'no funciona', 'me tiene loco', 'qué fastidio',
        'no puedo más', 'esto no sirve', 'da error', 'sigue fallando',
      ],
      ESTRESADO: [
        'tengo poco tiempo', 'es urgente', 'necesito esto ya',
        'mañana tengo', 'me están presionando', 'deadline',
      ],
      CANSADO: [
        'estoy cansado', 'no he dormido', 'llevo horas', 'estoy agotado',
        'ya es tarde', 'tengo sueño',
      ],
      MOTIVADO: [
        'vamos', 'lo logramos', 'funcionó', 'excelente', 'perfecto',
        'por fin', 'genial', 'esto está bien', 'me gusta',
      ],
      ENTUSIASTA: [
        'quiero hacer', 'tengo una idea', 'se me ocurrió',
        'qué tal si', 'podríamos', 'imagínate',
      ],
    };

    for (const [emotion, keywords] of Object.entries(patterns)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return emotion;
      }
    }
    return 'NEUTRAL';
  }

  getToneInstruction(emotion) {
    const tones = {
      FRUSTRADO: 'El usuario está frustrado. Responde con calma, brevedad y enfoque en la solución. Sin sermones.',
      ESTRESADO: 'El usuario está bajo presión. Sé directo y eficiente. Sin relleno.',
      CANSADO: 'El usuario está cansado. Respuestas cortas, amables y sin exigir mucho.',
      MOTIVADO: 'El usuario está motivado. Coincide con su energía positiva.',
      ENTUSIASTA: 'El usuario tiene ideas. Alienta y expande, no frenes su creatividad.',
      NEUTRAL: 'Tono natural y conversacional.',
    };
    return tones[emotion] || tones.NEUTRAL;
  }
}

module.exports = { EmotionDetector };
