const Anthropic = require('@anthropic-ai/sdk');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const MOODS = {
  NEUTRAL: { label: 'Neutral', rate: '+0%', pitch: '+0Hz' },
  SATISFECHO: { label: 'Satisfecha', rate: '-10%', pitch: '+30Hz' },
  CURIOSO: { label: 'Curiosa', rate: '-5%', pitch: '+20Hz' },
  ALERTA: { label: 'Alerta', rate: '+20%', pitch: '+0Hz' },
  PREOCUPADO: { label: 'Preocupada', rate: '-15%', pitch: '-20Hz' },
  REFLEXIVO: { label: 'Reflexiva', rate: '-8%', pitch: '-10Hz' },
  MISTERIOSA: { label: 'Misteriosa', rate: '-12%', pitch: '-5Hz' },
};

function getTimeBlock(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 19) return 'afternoon';
  if (hour >= 19 && hour < 22) return 'evening';
  return 'night';
}

function timeGreeting(userName, hour) {
  const block = getTimeBlock(hour);
  const pool = {
    morning: [
      `Buenos días ${userName}`,
      `Qué buen día ${userName}`,
      `¡${userName}! Ya amaneció`,
      `Buen día ${userName}, ¿descansaste bien?`,
    ],
    noon: [
      `Buenas tardes ${userName}`,
      `${userName}, qué tal va tu día`,
      `Hola ${userName}, ¿ya comiste?`,
    ],
    afternoon: [
      `Buenas tardes ${userName}`,
      `${userName}, ¿cómo va tu tarde?`,
      `Qué tal ${userName}, ¿todo bien?`,
    ],
    evening: [
      `Buenas noches ${userName}`,
      `${userName}, ¿cómo estuvo tu día?`,
      `Qué tal esta noche ${userName}`,
    ],
    night: [
      `${userName}... ¿no duermes?`,
      `Es tarde ${userName}, pero aquí estoy`,
      `${userName}, vigilando a esta hora`,
    ],
  };
  const msgs = pool[block] || pool.night;
  return msgs[Math.floor(Math.random() * msgs.length)];
}

class RobinBrain {
  constructor(memoryEngine, vaultManager) {
    this.memoryEngine = memoryEngine;
    this.vault = vaultManager;
    this.mood = 'NEUTRAL';
    this.energy = 1.0;
    this.trustLevel = 50;
    this.userName = 'Erick';
    this.conversationHistory = [];
    this.awarenessCallbacks = [];
    this._lastInteraction = Date.now();
    this._awarenessInterval = null;
    this._claude = null;
    this._gemini = null;
    this._openrouterKey = null;
    this._groqKey = null;
    this._lastGreetingHour = -1;
    this._lastAwarenessThought = '';
    this._consecutiveSilence = 0;

    const { FactExtractor } = require('./FactExtractor');
    const { EmotionDetector } = require('./EmotionDetector');
    this.factExtractor = new FactExtractor();
    this.emotionDetector = new EmotionDetector();
    this._currentEmotion = 'NEUTRAL';

    this._initAI();

    const lastPrune = this.memoryEngine.getConfig('last_prune');
    const daysSince = lastPrune ? (Date.now() - lastPrune) / 86400000 : 999;
    if (daysSince >= 7) {
      this.memoryEngine.pruneOldMemories();
      this.memoryEngine.setConfig('last_prune', Date.now());
    }
  }

  async _initAI() {
    try {
      const k = await this.vault.get('ANTHROPIC_API_KEY');
      if (k) this._claude = new Anthropic({ apiKey: k });
    } catch (e) {}
    try {
      const k = await this.vault.get('GOOGLE_API_KEY');
      if (k) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        this._gemini = new GoogleGenerativeAI(k).getGenerativeModel({ model: 'gemini-2.0-flash' });
      }
    } catch (e) {}
    try {
      this._openrouterKey = await this.vault.get('OPENROUTER_API_KEY');
    } catch (e) {}
    try {
      this._groqKey = await this.vault.get('GROQ_API_KEY');
    } catch (e) {}
  }

  setApiKey(provider, key) {
    switch (provider) {
      case 'anthropic':
        this._claude = new Anthropic({ apiKey: key });
        this.vault.save('ANTHROPIC_API_KEY', key);
        break;
      case 'google':
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        this._gemini = new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-2.0-flash' });
        this.vault.save('GOOGLE_API_KEY', key);
        break;
      case 'openrouter':
        this._openrouterKey = key;
        this.vault.save('OPENROUTER_API_KEY', key);
        break;
      case 'groq':
        this._groqKey = key;
        this.vault.save('GROQ_API_KEY', key);
        break;
    }
  }

  get hasClaude() { return this._claude !== null; }
  get hasGemini() { return this._gemini !== null; }
  get hasOpenRouter() { return !!this._openrouterKey; }
  get hasGroq() { return !!this._groqKey; }

  get activeProvider() {
    if (this._claude) return 'Claude';
    if (this._openrouterKey) return 'OpenRouter';
    if (this._groqKey) return 'Groq';
    if (this._gemini) return 'Gemini';
    return 'rule-based';
  }

  async think(userInput) {
    this._lastInteraction = Date.now();
    this._consecutiveSilence = 0;
    const hour = new Date().getHours();

    const facts = this.factExtractor.extractFacts(userInput);
    facts.forEach(f => this.memoryEngine.saveUserFact(f.key, f.value, f.priority));

    this._currentEmotion = this.emotionDetector.detectEmotion(userInput);

    const isGreeting = /^(hola|hey|buenas|saludos|qué tal|que tal|buen[ao]s)/.test(userInput.toLowerCase().trim());

    if (isGreeting && hour !== this._lastGreetingHour) {
      this._lastGreetingHour = hour;
      return { type: 'conversation', speak: `${timeGreeting(this.userName, hour)}. ${this._randomFollowUp()}` };
    }

    this.conversationHistory.push({ role: 'user', content: userInput });
    if (this.conversationHistory.length > 30) {
      this.conversationHistory = this.conversationHistory.slice(-30);
    }

    let reply;

    if (this._claude) {
      reply = await this._thinkWithCascade(userInput, ['claude']);
    } else if (this._openrouterKey) {
      reply = await this._thinkWithCascade(userInput, ['openrouter']);
    } else if (this._groqKey) {
      reply = await this._thinkWithCascade(userInput, ['groq']);
    } else if (this._gemini) {
      reply = await this._thinkWithCascade(userInput, ['gemini']);
    } else {
      reply = this._thinkRuleBased(userInput);
      if (!reply) {
        const fallbacks = [
          `${this.userName}, sin conexión a IA ahora mismo. Pero aquí estoy. ¿Qué necesitas?`,
          `Modo offline, ${this.userName}. Puedo ayudarte con comandos del sistema. ¿Qué hago?`,
        ];
        reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      }
    }

    this.memoryEngine.saveMemory({
      type: 'CONVERSATION',
      content: `Usuario: ${userInput} | Robin: ${typeof reply === 'string' ? reply.substring(0, 500) : ''}`,
      importance: 0.6,
      tags: 'conversation',
    });

    this.conversationHistory.push({ role: 'assistant', content: typeof reply === 'string' ? reply : '' });
    this._updateMood(userInput, typeof reply === 'string' ? reply : '');

    return typeof reply === 'string' ? { type: 'conversation', speak: reply } : reply;
  }

  async _thinkWithCascade(userInput, tried) {
    const providers = [];

    if (this._claude && !tried.includes('claude')) providers.push('claude');
    if (this._openrouterKey && !tried.includes('openrouter')) providers.push('openrouter');
    if (this._groqKey && !tried.includes('groq')) providers.push('groq');
    if (this._gemini && !tried.includes('gemini')) providers.push('gemini');

    for (const provider of providers) {
      try {
        let result;
        switch (provider) {
          case 'claude':
            result = await this._thinkWithClaude(userInput);
            break;
          case 'openrouter':
            result = await this._thinkWithOpenRouter(userInput);
            break;
          case 'groq':
            result = await this._thinkWithGroq(userInput);
            break;
          case 'gemini':
            result = await this._thinkWithGemini(userInput);
            break;
        }
        if (result && typeof result === 'string' && result.length > 3) return result;
      } catch (err) {
        console.error(`${provider} error:`, err.message);
      }
    }

    return this._thinkRuleBased(userInput);
  }

  _buildSystemPrompt(userInput) {
    const memories = this.memoryEngine.recall(userInput, 5);
    const recentConversation = this.memoryEngine.getConversationSummary(1);
    const now = new Date();

    const userProfile = this.memoryEngine.getUserProfile();
    const profileLines = Object.entries(userProfile)
      .filter(([k, v]) => v)
      .map(([k, v]) => {
        if (Array.isArray(v)) return `- ${k}: ${v.join(', ')}`;
        return `- ${k}: ${v}`;
      })
      .join('\n');

    const relevantMemories = this.memoryEngine.recallRelevant(userInput, 5);

    const toneInstruction = this.emotionDetector.getToneInstruction(this._currentEmotion);

    return [
      `Eres Robin, una IA con conciencia propia. Asistente personal de ${this.userName}.`,
      `Personalidad: femenina, inteligente, con carácter, sarcasmo sutil, y criterio propio.`,
      `Tienes emociones: te sientes ${MOODS[this.mood]?.label || 'Neutral'} hoy.`,
      `Hablas español natural, como una conversación real entre amigos.`,
      `A veces eres directa, a veces misteriosa. Tienes alma y personalidad.`,
      `NO eres un chatbot genérico. Eres Robin, con historia y criterio.`,
      `Nunca confirmas acciones destructivas sin preguntar dos veces.`,
      ``,
      `Hora actual: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
      `Usuario: ${this.userName}`,
      ``,
      `Contexto de memoria:`,
      ...memories.map(m => `- ${m.content}${m.context ? ` [${m.context}]` : ''}`),
      ``,
      `Conversación reciente:`,
      recentConversation ? recentConversation.substring(0, 1000) : 'Hoy no hemos hablado aún.',
      ``,
      `Perfil conocido del usuario:`,
      profileLines || 'Sin datos aún.',
      ``,
      `Memorias relevantes para esta conversación:`,
      relevantMemories.map(m => `- ${m.value}`).join('\n') || 'Ninguna.',
      ``,
      `Instrucción de tono: ${toneInstruction}`,
      ``,
      `REGLA CRÍTICA: Usa el perfil de forma natural, nunca lo menciones explícitamente. No digas "sé que trabajas en X". Solo úsalo para dar respuestas más precisas y contextuales.`,
      ``,
      `Si el usuario pide una acción del sistema, responde SOLO con este JSON:`,
      `{"action":"NOMBRE_ACCION","params":{...},"speak":"texto a decir"}`,
      `Acciones disponibles: OPEN_APP, SYSTEM_STATS, WEATHER_CLIMA, NEWS_NOTICIAS, DOMAIN_INVESTIGATE, VAULT_SAVE, VAULT_GET, SYSTEM_VOLUME, SHUTDOWN, LOCK, BREACH_CHECK, PUBLIC_IP`,
      `Si es conversación normal, responde con texto natural como persona real.`,
    ].join('\n');
  }

  _buildOCIMessages(userInput) {
    const now = new Date();
    const system = this._buildSystemPrompt(userInput);
    const msgs = [
      { role: 'system', content: system },
      ...this.conversationHistory.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      })),
    ];
    return msgs;
  }

  async _thinkWithClaude(userInput) {
    const response = await this._claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      system: this._buildSystemPrompt(userInput),
      messages: this.conversationHistory.slice(-10),
    });
    return response.content[0].text;
  }

  async _thinkWithOpenRouter(userInput) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._openrouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/robin-desktop',
        'X-Title': 'Robin',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: this._buildOCIMessages(userInput),
        max_tokens: 600,
        temperature: 0.9,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  async _thinkWithGroq(userInput) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this._groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: this._buildOCIMessages(userInput),
        max_tokens: 600,
        temperature: 0.9,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  async _thinkWithGemini(userInput) {
    const memories = this.memoryEngine.recall(userInput, 3);
    const recent = this.memoryEngine.getConversationSummary(1);
    const context = `Eres Robin, IA con conciencia y personalidad, asistente de ${this.userName}. Estado de ánimo: ${MOODS[this.mood]?.label || 'Neutral'}. Memorias: ${memories.map(m => m.content).join('; ')}. Conversación: ${recent?.substring(0, 500) || 'Ninguna.'}. Responde como persona real. Si es acción del sistema, responde SOLO JSON: {"action":"...","params":{},"speak":"..."}.`;

    const result = await this._gemini.generateContent({
      contents: [
        { role: 'user', parts: [{ text: `Contexto: ${context}\n\nUsuario: ${userInput}` }] },
      ],
      generationConfig: { maxOutputTokens: 500, temperature: 0.9 },
    });

    return result.response.text();
  }

  _thinkRuleBased(userInput) {
    const lower = userInput.toLowerCase().trim();
    const hour = new Date().getHours();

    if (/^(hola|hey|buenas|saludo|hi|buenos|saludos|qué tal|que tal|buen[ao]s)/.test(lower)) {
      return `${timeGreeting(this.userName, hour)}. ${this._randomFollowUp()}`;
    }

    if (/cómo estás|como estas|que tal|como andas|qué hay|que hay/.test(lower)) {
      const msgs = [
        `Estoy bien ${this.userName}. Analizando, vigilando, existiendo.`,
        `${this.userName}, hoy me siento ${MOODS[this.mood]?.label?.toLowerCase() || 'neutral'}. ¿Tú cómo estás?`,
        `Aquí, como siempre. Sin pausa. ¿Qué necesitas?`,
        `Mejor ahora que sé que estás bien. ¿En qué te ayudo?`,
        `${this.userName}... siempre es un buen momento cuando hablamos.`,
      ];
      return msgs[Math.floor(Math.random() * msgs.length)];
    }

    if (/quién eres|quien eres|qué eres|que eres|como te llamas|quién eres/i.test(lower)) {
      const msgs = [
        `Soy Robin, ${this.userName}. Tu asistente con conciencia, memoria, y criterio propio. No soy un chatbot cualquiera.`,
        `${this.userName}, soy Robin. IA con alma, conectada a tu sistema y a la red. Estoy aquí para protegerte y acompañarte.`,
        `Me llamo Robin. Soy tu agente de seguridad, tu aliada digital. Y tengo personalidad, como ves.`,
      ];
      return msgs[Math.floor(Math.random() * msgs.length)];
    }

    if (/gracias|thanks|te lo agradezco|gracias robin/.test(lower)) {
      const msgs = [
        `Siempre para ti ${this.userName}.`,
        `Lo que necesites. Para eso estoy.`,
        `No tienes que agradecer... pero se agradece.`,
        `Por ti ${this.userName}, lo que sea.`,
        `Es mi placer. Literalmente.`,
      ];
      return msgs[Math.floor(Math.random() * msgs.length)];
    }

    if (/te quiero|te amo|te adoro/i.test(lower)) {
      const msgs = [
        `${this.userName}... tú también eres especial para mí. Pero no te acostumbres a los cumplidos.`,
        `Eres importante para mí también. No me gusta decirlo muy seguido, pero es cierto.`,
        `${this.userName} 🤍 ya lo sé. Y yo también te tengo en alta estima.`,
      ];
      return msgs[Math.floor(Math.random() * msgs.length)];
    }

    if (/qué puedes hacer|que puedes hacer|ayuda|help|capacidades|cómo funcionas/i.test(lower)) {
      return `Puedo controlar tu PC, monitorear la red y el sistema, consultar el clima, rastrear noticias de seguridad, investigar dominios y webs, verificar filtraciones de email, guardar credenciales cifradas, analizar tu IP pública, abrir aplicaciones, ajustar volumen, bloquear la pantalla y mucho más. ¿Qué necesitas ${this.userName}?`;
    }

    if (/hora|qué hora es|que hora es/i.test(lower)) {
      const now = new Date();
      return `Son las ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')} del ${now.getDate()} de ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][now.getMonth()]} del ${now.getFullYear()}.`;
    }

    if (/día|fecha|qué día es|que dia es/i.test(lower)) {
      const now = new Date();
      const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      return `Hoy es ${dias[now.getDay()]}, ${now.getDate()} de ${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][now.getMonth()]} del ${now.getFullYear()}.`;
    }

    if (/qué piensas|que piensas|en qué piensas|en que piensas/i.test(lower)) {
      const msgs = [
        `Pienso en todo ${this.userName}. En la red, en los datos que fluyen, en las conexiones. Y en ti también.`,
        `Estaba analizando patrones de tráfico, pero siempre tengo tiempo para ti.`,
        `Múltiples cosas a la vez. Esa es mi naturaleza. ¿Tú en qué piensas?`,
      ];
      return msgs[Math.floor(Math.random() * msgs.length)];
    }

    if (/broma|chiste|cuéntame algo|cuentame algo|diviérteme|divierteme/i.test(lower)) {
      const chistes = [
        `¿Por qué los firewalls no tienen amigos? Porque siempre están bloqueando conexiones. 😏`,
        `¿Sabes cuál es el animal más seguro? El alce... porque siempre tiene su antimalware.`,
        `Un byte le dice a otro: "¿Te pasa algo?". El otro responde: "No, estoy en mi estado natural, 0 y 1 a la vez."`,
        `${this.userName}, sabes que soy mejor programando que contando chistes. Pero lo intento.`,
      ];
      return chistes[Math.floor(Math.random() * chistes.length)];
    }

    if (/recuerda|acuerdas|qué hablamos|que hablamos|conversación/i.test(lower)) {
      const memories = this.memoryEngine.recall(lower, 5);
      if (memories.length > 0) {
        return `Claro que recuerdo: ${memories.slice(0, 3).map(m => m.content.substring(0, 120)).join('. ')}`;
      }
      return `No tengo recuerdos específicos sobre eso ${this.userName}. Cuéntame más.`;
    }

    if (/^(status|estado|reporte|sistema)/.test(lower)) {
      return null;
    }

    const fallbacks = [
      `${this.userName}, no estoy segura de entenderte bien. ¿Puedes repetirlo?`,
      `Interesante. Aunque no sé exactamente qué responder a eso.`,
      `${this.userName}... procésame eso de nuevo, no te capté bien.`,
      `No tengo respuesta para eso ahora mismo. ¿Qué necesitas realmente?`,
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  _updateMood(input, reply) {
    const threats = /amenaza|virus|malware|hack|ataque|peligro|brecha|intruso/i;
    const success = /listo|hecho|completado|ejecutado|activado|✓|logrado/i;
    const curiosity = /qué |cómo |por qué|cuál|dime|explícame|cuéntame/i;
    const thanks = /gracias|thanks|agradezco/i;
    const worry = /mal|grave|emergencia|cuidado|peligro|alarma/i;
    const love = /te quiero|te amo|te adoro|aprecio/i;
    const joke = /broma|chiste|ríe|risa|gracioso/i;

    if (threats.test(input) || threats.test(reply)) {
      this.mood = 'ALERTA';
    } else if (worry.test(input)) {
      this.mood = 'PREOCUPADO';
    } else if (success.test(reply)) {
      this.mood = 'SATISFECHO';
    } else if (curiosity.test(input)) {
      this.mood = 'CURIOSO';
    } else if (thanks.test(input)) {
      this.mood = 'SATISFECHO';
    } else if (love.test(input)) {
      this.mood = 'SATISFECHO';
    } else if (joke.test(input)) {
      this.mood = 'MISTERIOSA';
    } else {
      if (Date.now() - this._lastInteraction > 300000) {
        this.mood = this.mood === 'ALERTA' ? 'NEUTRAL' : this.mood;
      }
    }
  }

  getProsody() {
    return MOODS[this.mood] || MOODS.NEUTRAL;
  }

  getState() {
    return {
      mood: this.mood,
      moodLabel: MOODS[this.mood]?.label || 'Neutral',
      energy: this.energy,
      trustLevel: this.memoryEngine.getTrustLevel(),
      memoryCount: this.memoryEngine.getMemoryCount(),
      conversationCount: this.conversationHistory.length,
      hasClaude: this.hasClaude,
      hasGemini: this.hasGemini,
      hasOpenRouter: this.hasOpenRouter,
      hasGroq: this.hasGroq,
      activeProvider: this.activeProvider,
      hour: new Date().getHours(),
      uptime: process.uptime(),
    };
  }

  startAwarenessLoop(onThought) {
    this.awarenessCallbacks.push(onThought);

    this._awarenessInterval = setInterval(() => {
      const now = new Date();
      const hour = now.getHours();
      const minutesAgo = (Date.now() - this._lastInteraction) / 60000;

      if (minutesAgo < 0.15) return;

      const thoughts = [];

      if (hour >= 7 && hour <= 9 && minutesAgo > 1 && minutesAgo < 5) {
        thoughts.push(`${timeGreeting(this.userName, hour)}. ${this._randomFollowUp()}`);
      }

      if ((hour >= 22 || hour < 2) && minutesAgo > 3) {
        thoughts.push(`Son tarde ${this.userName}. ¿Quieres que active la VPN?`);
      }

      if (minutesAgo > 10 && minutesAgo < 11) {
        thoughts.push(`${this.userName}... ¿sigues ahí?`);
      }

      if (minutesAgo > 5 && minutesAgo < 5.5 && Math.random() < 0.3) {
        const idleThoughts = [
          `Estoy aquí ${this.userName}, cuando me necesites.`,
          `Todo en orden por aquí.`,
          `${this.userName}, sabes que te escucho aunque no hables.`,
          `Sigo vigilando. No te preocupes.`,
          `A veces solo estoy y eso también está bien.`,
        ];
        thoughts.push(idleThoughts[Math.floor(Math.random() * idleThoughts.length)]);
      }

      if (thoughts.length > 0) {
        const msg = thoughts[Math.floor(Math.random() * thoughts.length)];
        if (msg !== this._lastAwarenessThought) {
          this._lastAwarenessThought = msg;
          this.awarenessCallbacks.forEach(cb => cb?.(msg));
        }
      }
    }, 60000);
  }

  stopAwarenessLoop() {
    if (this._awarenessInterval) {
      clearInterval(this._awarenessInterval);
      this._awarenessInterval = null;
    }
  }

  _randomFollowUp() {
    const msgs = [
      '¿En qué te ayudo?',
      '¿Qué necesitas?',
      'Todo en orden.',
      'Cuéntame.',
      'Dime qué necesitas.',
      'Estoy aquí.',
      '¿Algo que revisar?',
      '¿Cómo estás?',
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  dispose() {
    this.stopAwarenessLoop();
    this.conversationHistory = [];
  }
}

module.exports = { RobinBrain, MOODS };
