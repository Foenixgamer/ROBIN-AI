class ActionEngine {
  constructor(systemController, intelligence, memoryEngine, vaultManager, brain, voiceEngine, threatIntel, processMonitor, trafficLogger, profileManager, alarmManager, automationEngine, volumeController, vaultBackup) {
    this.system = systemController;
    this.intel = intelligence;
    this.memory = memoryEngine;
    this.vault = vaultManager;
    this.brain = brain;
    this.voice = voiceEngine;
    this.threatIntel = threatIntel || null;
    this.processMonitor = processMonitor || null;
    this.trafficLogger = trafficLogger || null;
    this.profileManager = profileManager || null;
    this.alarmManager = alarmManager || null;
    this.automationEngine = automationEngine || null;
    this.volumeController = volumeController || null;
    this.vaultBackup = vaultBackup || null;
  }

  // Normaliza entrada eliminando prefijos conversacionales comunes
  _normalizeInput(lower) {
    const prefixes = [
      /^(?:quiero|quisiera|necesito|puedes|podr\u00edas|me puedes|me podr\u00edas|te pido|te quiero pedir|voy a)\s+/i,
      /^(?:haz|hacer|realizar|ejecutar|poner|pon)\s+(?:un|una|el|la|me)\s+/i,
      /^(?:ay\u00fadame a|ayudame a|ay\u00fadame|ayudame)\s+/i,
      /^(?:revisa|revisar|chequea|chequear|verifica|verificar|comprueba|comprobar)\s+(?:el|la|los|las|mis|mi|tu)\s+/i,
    ];
    let n = lower;
    for (const p of prefixes) { n = n.replace(p, ''); }
    return n.trim();
  }

  // Detecci\u00f3n flexible de intenciones — corre ANTES de brain.think()
  async _preBrainDetect(lower, normalized, userName) {
    // ── Escaneo de seguridad (flexible) ──
    const scanWords = /(?:escan[ée]|[ae]naliz[ai]|revis[ai])/i;
    if ((scanWords.test(lower) && /(?:procesos|sistem[as]|seguridad|amenazas|virus|malware)/i.test(lower))
        || /procesos\s*(?:sospechosos|activos|ejecut[áa]ndose)/i.test(normalized))
    {
      if (this.processMonitor) {
        const result = await this.processMonitor.scan();
        const suspicious = result.alerts.filter(a => a.type === 'suspicious_process');
        if (suspicious.length > 0) {
          const names = suspicious.map(a => a.process.name).join(', ');
          return { speak: `Encontré ${suspicious.length} proceso${suspicious.length > 1 ? 's' : ''} sospechoso${suspicious.length > 1 ? 's' : ''}: ${names}. ¿Quieres que los elimine?`, action: 'SHOW_SUSPICIOUS_PROCESSES', data: suspicious };
        }
        return { speak: `Escaneé ${result.snapshot.length} procesos. Todo parece normal.` };
      }
    }

    // ── IP p\u00fablica (flexible) ──
    if (/(?:mi\s*ip|ip\s*p[uú]blica|analiz[ai].*ip|saber.*ip|consult.*ip|cu[aá]l\s*es\s*mi\s*ip)/i.test(normalized)
        || /ip\s*p[uú]blica/i.test(normalized)) {
      return { action: 'PUBLIC_IP', params: {}, speak: 'Consultando tu IP...' };
    }

    // ── An\u00e1lisis del sistema ──
    if (/(?:analiz[ai].*sistem[as]|revis[ai].*sistem[as]|analiz[ai].*estado|status|estado\s*del\s*sistema|reporte\s*del\s*sistema)/i.test(normalized)
        || /^(?:status|estado|reporte|sistema)/i.test(normalized)) {
      return { action: 'SYSTEM_STATS', params: {}, speak: 'Analizando el sistema...' };
    }

    // ── Bloqueo de pantalla ──
    if (/bloque[ai].*pantalla|bloquear.*sesi[oó]n/i.test(normalized)) {
      const { exec } = require('child_process');
      exec('rundll32.exe user32.dll,LockWorkStation');
      return { speak: 'Pantalla bloqueada.' };
    }

    // ── VPN ──
    if (/vpn/i.test(normalized)) {
      if (/activ|prender|on|conectar/i.test(normalized)) {
        return { action: 'VPN_ON', params: {}, speak: 'VPN activada. Tu tráfico está seguro.' };
      }
      if (/desactiv|apagar|off|desconectar/i.test(normalized)) {
        return { action: 'VPN_OFF', params: {}, speak: 'VPN desactivada.' };
      }
      return { speak: '¿Activar o desactivar la VPN?' };
    }

    return null;
  }

  async process(text) {
    const lower = text.toLowerCase().trim();
    const normalized = this._normalizeInput(lower);
    const userName = this.brain.userName;

    // ── Detección pre-brain: comandos flexibles ──
    const preBrain = await this._preBrainDetect(lower, normalized, userName);
    if (preBrain) {
      if (preBrain.action) {
        return await this.executeAction(preBrain.action, preBrain.params || {}, preBrain.speak || '');
      }
      return preBrain;
    }

    // HORA
    if (/qué hora|hora es|dime la hora/i.test(lower)) {
      const now = new Date();
      const h = now.getHours().toString().padStart(2, '0');
      const m = now.getMinutes().toString().padStart(2, '0');
      return { speak: `Son las ${h} y ${m}.` };
    }

    // FECHA
    if (/qué día|fecha|día es hoy/i.test(lower)) {
      const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const now = new Date();
      return { speak: `Hoy es ${days[now.getDay()]} ${now.getDate()} de ${months[now.getMonth()]} de ${now.getFullYear()}.` };
    }

    // CLIMA / TEMPERATURA
    if (/clima|temperatura|tiempo|llueve|calor|frío/i.test(lower)) {
      try {
        const res = await fetch('https://wttr.in/Santo+Domingo?format=%t+%C', { signal: AbortSignal.timeout(5000) });
        const weather = await res.text();
        return { speak: `En Santo Domingo hay ${weather.trim()}.` };
      } catch (e) {
        return { speak: 'No pude obtener el clima ahora mismo.' };
      }
    }

    // BLOQUEAR PANTALLA
    if (/bloquea|bloquear pantalla|bloquea la pantalla/i.test(lower)) {
      const { exec } = require('child_process');
      exec('rundll32.exe user32.dll,LockWorkStation');
      return { speak: 'Pantalla bloqueada.' };
    }

    // ABRIR APP
    if (/abre|abrir|lanza|ejecuta/i.test(lower)) {
      const appMatch = lower.match(/(?:abre|abrir|lanza|ejecuta)\s+(.+)/);
      if (appMatch) {
        const { exec } = require('child_process');
        exec(`start ${appMatch[1]}`);
        return { speak: `Abriendo ${appMatch[1]}.` };
      }
    }

    // VOLUMEN
    if (/sube el volumen|subir volumen/i.test(lower)) {
      if (this.volumeController) {
        this.volumeController.setVolume(60);
        return { speak: 'Subiendo el volumen.' };
      }
      const { exec } = require('child_process');
      exec('powershell -c "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]175)"');
      return { speak: 'Subiendo el volumen.' };
    }
    if (/baja el volumen|bajar volumen/i.test(lower)) {
      if (this.volumeController) {
        this.volumeController.setVolume(20);
        return { speak: 'Bajando el volumen.' };
      }
      const { exec } = require('child_process');
      exec('powershell -c "$obj = New-Object -ComObject WScript.Shell; $obj.SendKeys([char]174)"');
      return { speak: 'Bajando el volumen.' };
    }
    if (/volumen al (\d+)/i.test(lower)) {
      if (this.volumeController) {
        const m = lower.match(/volumen al (\d+)/i);
        const level = parseInt(m[1], 10);
        this.volumeController.setVolume(level);
        return { speak: `Volumen al ${level}%.` };
      }
    }

    // ESCANEAR PROCESOS SOSPECHOSOS
    if (/escanea procesos|analiza procesos|procesos sospechosos/i.test(lower)) {
      if (!this.processMonitor) return { speak: 'El monitor de procesos no está disponible.' };
      const result = await this.processMonitor.scan();
      const suspicious = result.alerts.filter(a => a.type === 'suspicious_process');
      if (suspicious.length > 0) {
        const names = suspicious.map(a => a.process.name).join(', ');
        return { speak: `Encontré ${suspicious.length} proceso${suspicious.length > 1 ? 's' : ''} sospechoso${suspicious.length > 1 ? 's' : ''}: ${names}. ¿Quieres que los elimine?`, action: 'SHOW_SUSPICIOUS_PROCESSES', data: suspicious };
      }
      return { speak: `Escaneé ${result.snapshot.length} procesos. Todo parece normal.` };
    }

    // PERFILES DE SISTEMA
    if (/modo trabajo|perfil trabajo|activar trabajo/i.test(lower)) {
      if (!this.profileManager) return { speak: 'Gestor de perfiles no disponible.' };
      const r = await this.profileManager.activate('trabajo');
      return { speak: r.success ? `Modo trabajo activado. ${r.applied.join(', ')}` : r.error };
    }
    if (/modo casa|perfil casa|activar casa/i.test(lower)) {
      if (!this.profileManager) return { speak: 'Gestor de perfiles no disponible.' };
      const r = await this.profileManager.activate('casa');
      return { speak: r.success ? `Modo casa activado. ${r.applied.join(', ')}` : r.error };
    }
    if (/modo noche|perfil noche|activar noche/i.test(lower)) {
      if (!this.profileManager) return { speak: 'Gestor de perfiles no disponible.' };
      const r = await this.profileManager.activate('noche');
      return { speak: r.success ? `Modo noche activado. ${r.applied.join(', ')}` : r.error };
    }
    if (/modo viaje|perfil viaje|activar viaje/i.test(lower)) {
      if (!this.profileManager) return { speak: 'Gestor de perfiles no disponible.' };
      const r = await this.profileManager.activate('viaje');
      return { speak: r.success ? `Modo viaje activado. ${r.applied.join(', ')}` : r.error };
    }

    // ALARMAS / RECORDATORIOS
    if (/pon.*alarma|crea.*alarma|recu\u00e9rdame|activa.*recordatorio/i.test(lower)) {
      if (!this.alarmManager) return { speak: 'Gestor de alarmas no disponible.' };
      const parsed = this.alarmManager.parseVoiceCommand(text);
      if (parsed) {
        const id = this.alarmManager.create(parsed.label, parsed.triggerAt, parsed.repeatType);
        const timeStr = parsed.triggerDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const repeatTxt = parsed.repeatType === 'daily' ? ' diaria' : '';
        return { speak: `Alarma${repeatTxt} programada para las ${timeStr}: ${parsed.label}` };
      }
      return { speak: 'No entend\u00ed la hora. Di por ejemplo: recu\u00e9rdame comprar leche a las 3 pm' };
    }
    if (/cancela.*alarma|elimina.*alarma|borra.*alarma/i.test(lower)) {
      const alarms = this.alarmManager?.list() || [];
      if (alarms.length === 0) return { speak: 'No tienes alarmas programadas.' };
      return { speak: `Tienes ${alarms.length} alarma${alarms.length > 1 ? 's' : ''} programada${alarms.length > 1 ? 's' : ''}. Di el n\u00famero para cancelar.`, action: 'LIST_ALARMS', data: alarms };
    }

    // LISTAR AUTOMATIZACIONES
    if (/qu\u00e9 automatizaciones|lista automatizaciones|automatizaciones activas/i.test(lower)) {
      if (!this.automationEngine) return { speak: 'Motor de automatizaciones no disponible.' };
      const list = this.automationEngine.list();
      const enabled = list.filter(a => a.enabled);
      if (enabled.length === 0) return { speak: 'No hay automatizaciones activas.' };
      const names = enabled.map(a => a.name).join(', ');
      return { speak: `Automatizaciones activas: ${names}.` };
    }

    // ── VAULT: Guardar contrase├▒a ──
    if (/guarda(?:r)? (?:la )?contrase├▒a|nueva contrase├▒a|agregar cuenta/i.test(lower)) {
      const serviceMatch = lower.match(/(?:de|para|en)\s+([a-z├í├®├¡├│├║├▒0-9]+)/i);
      const service = serviceMatch ? serviceMatch[1] : 'desconocido';
      const suggested = this.vault?.generatePassword({ length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true });
      return {
        speak: `┐Cu├íl es el usuario para ${service}? Tambi├®n puedo generar una contrase├▒a segura: ${suggested?.slice(0, 6) || '...'}...`,
        action: 'VAULT_START_SAVE',
        data: { service, suggestedPassword: suggested }
      };
    }

    // ── VAULT: Buscar contrase├▒a ──
    if (/(?:busca|dame|cu├íl es|contrase├▒a de|password de|acceso a)\s+(.+)/i.test(lower)) {
      const match = lower.match(/(?:busca|dame|cu├íl es|contrase├▒a de|password de|acceso a)\s+(.+)/i);
      const service = match ? match[1].trim() : '';
      if (!service) return { speak: '┐Para qu├® servicio buscas la contrase├▒a?' };
      const results = this.vault ? await this.vault.getCredentials(service) : [];
      if (results.length === 0) return { speak: `No tengo contrase├▒as guardadas para ${service}.` };
      if (results.length === 1) {
        const entry = await this.vault.getCredentialById(results[0].id);
        return {
          speak: `Encontr├® tu cuenta de ${service}. Usuario: ${entry.username}. Contrase├▒a copiada al portapapeles.`,
          action: 'COPY_TO_CLIPBOARD',
          data: { text: entry.password }
        };
      }
      const names = results.map(r => r.username).join(', ');
      return { speak: `Tengo ${results.length} cuentas de ${service}: ${names}. ┐Cu├íl necesitas?` };
    }

    // ── VAULT: Listar cuentas ──
    if (/qu├® contrase├▒as|cu├íntas cuentas|mis cuentas guardadas/i.test(lower)) {
      if (!this.vault) return { speak: 'Gestor de contrase├▒as no disponible.' };
      const list = await this.vault.listCredentials();
      if (list.length === 0) return { speak: 'No tienes contrase├▒as guardadas a├║n. Di "guardar contrase├▒a de Gmail" para empezar.' };
      const services = [...new Set(list.map(e => e.service))].slice(0, 5).join(', ');
      return { speak: `Tienes ${list.length} contrase├▒a${list.length > 1 ? 's' : ''} guardada${list.length > 1 ? 's' : ''}. Incluyendo: ${services}.` };
    }

    // ── VAULT: Generar contrase├▒a ──
    if (/genera(?:r)? (?:una )?contrase├▒a|contrase├▒a segura|nueva clave/i.test(lower)) {
      if (!this.vault) return { speak: 'Gestor de contrase├▒as no disponible.' };
      const longMatch = lower.match(/(\d+)\s*(?:caracteres|chars)/);
      const length = longMatch ? parseInt(longMatch[1]) : 20;
      const noSymbols = /sin s├¡mbolos|solo letras/i.test(lower);
      const password = this.vault.generatePassword({ length: Math.min(Math.max(length, 8), 64), symbols: !noSymbols });
      return {
        speak: `Contrase├▒a generada de ${length} caracteres. Copiada al portapapeles.`,
        action: 'COPY_TO_CLIPBOARD',
        data: { text: password }
      };
    }

    // ── VAULT: Backup ──
    if (/backup del vault|respalda(?:r)? contrase├▒as|exporta(?:r)? vault/i.test(lower)) {
      if (!this.vaultBackup) return { speak: 'Sistema de backup no disponible.' };
      const result = await this.vaultBackup.export();
      if (result.success) {
        return { speak: `Backup creado con ${result.entries} contrase├▒as. Guardado en tu carpeta de usuario.` };
      }
      return { speak: 'No pude crear el backup. Int├®ntalo de nuevo.' };
    }

    // ── VAULT: Eliminar cuenta ──
    if (/elimina(?:r)?|borra(?:r)?|quita(?:r)?/i.test(lower) && /contrase├▒a|cuenta|acceso/i.test(lower)) {
      if (!this.vault) return { speak: 'Gestor de contrase├▒as no disponible.' };
      const serviceMatch = lower.match(/(?:de|para|en)\s+([a-z├í├®├¡├│├║├▒0-9]+)/i);
      const service = serviceMatch ? serviceMatch[1] : '';
      if (!service) return { speak: '┐Qu├® contrase├▒a quieres eliminar?' };
      const results = await this.vault.getCredentials(service);
      if (results.length === 0) return { speak: `No encontr├® contrase├▒as de ${service}.` };
      await this.vault.deleteCredential(results[0].id);
      return { speak: `Elimin├® la contrase├▒a de ${service}.` };
    }

    const brainReply = await this.brain.think(text);

    let speakText = '';
    let action = null;
    let params = {};

    if (typeof brainReply === 'object' && brainReply.type === 'conversation') {
      speakText = brainReply.speak;
    } else if (typeof brainReply === 'string' && brainReply.trim().startsWith('{') && brainReply.includes('"action"')) {
      try {
        const parsed = JSON.parse(brainReply);
        action = parsed.action;
        params = parsed.params || {};
        speakText = parsed.speak || '';
      } catch (e) {
        speakText = brainReply;
      }
    } else if (typeof brainReply === 'string') {
      speakText = brainReply;
    }

    if (action) {
      const result = await this.executeAction(action, params, speakText);
      return result;
    }

    // Post-brain override: even if AI spoke, check deterministic commands
    const commandResult = this._detectCommand(lower, userName);
    if (commandResult) {
      if (commandResult.action) {
        return await this.executeAction(commandResult.action, commandResult.params || {}, commandResult.speak || '');
      }
      return commandResult;
    }

    if (speakText) {
      return { speak: speakText };
    }

    return {
      speak: this._random([
        `${userName}, no entendí completamente. Puedo ayudarte con análisis de seguridad, ver tu IP, revisar el sistema o buscar contraseñas.`,
        `${userName}, no capté del todo. Prueba con: "analiza mis sistemas", "mi IP pública" o "escanea procesos".`,
        `No estoy segura ${userName}. ¿Quieres que escanee procesos, analice el sistema o verifique tu red?`,
      ]),
    };
  }

  _detectCommand(lower, userName) {
    if (/qué sabes de mí|qué recuerdas|cuéntame sobre mí/i.test(lower)) {
      const profile = this.memory.getUserProfile();
      const facts = this.memory.recallRelevant('', 10);
      const parts = [];
      if (profile.nombre) parts.push(`Tu nombre es ${profile.nombre}.`);
      if (profile.profesion) parts.push(`Trabajas en ${profile.profesion}.`);
      if (facts.length > 0) {
        const highlights = facts.slice(0, 4).map(f => f.value).join(', ');
        parts.push(`También recuerdo: ${highlights}.`);
      }
      const response = parts.length > 0
        ? parts.join(' ')
        : 'Todavía no sé mucho de ti. Cuéntame más.';
      return { speak: response };
    }

    if (/vpn/.test(lower)) {
      if (/activ|prender|on|conectar/.test(lower)) {
        return { action: 'VPN_ON', params: {}, speak: this._random(['VPN activada. Tu tráfico está seguro.', `Listo ${userName}. Conexión protegida.`]) };
      }
      if (/desactiv|apagar|off|desconectar/.test(lower)) {
        return { action: 'VPN_OFF', params: {}, speak: this._random([`VPN desactivada ${userName}.`, 'Desconectado.']) };
      }
      return { speak: `¿Activar o desactivar la VPN ${userName}?` };
    }

    if (/^(status|estado|reporte|sistema|cómo estamos|como estamos)/.test(lower)) {
      return { action: 'SYSTEM_STATS', params: {}, speak: `Consultando el sistema ${userName}...` };
    }

    const weatherMatch = lower.match(/(?:clima|tiempo|temperatura)(?:\s+(?:de|en|del)\s+)?(.+)?/);
    if (weatherMatch) {
      const city = weatherMatch[1]?.trim() || '';
      return { action: 'WEATHER', params: { city }, speak: `Consultando el clima${city ? ` en ${city}` : ''}...` };
    }

    if (/noticia|seguridad|noticias|novedades|prensa/.test(lower)) {
      return { action: 'SECURITY_NEWS', params: {}, speak: 'Buscando noticias de seguridad...' };
    }

    const domainMatch = lower.match(/investiga?\s*(?:el\s+)?(?:dominio\s+|sitio\s+|url\s+|web\s+)?([a-z0-9][a-z0-9.-]+\.[a-z]{2,})/i);
    if (domainMatch) {
      const domain = domainMatch[1].toLowerCase();
      return { action: 'DOMAIN_INVESTIGATE', params: { domain }, speak: `Investigando ${domain}...` };
    }

    if (/mi ip|ip pública|ip publica|cuál es mi ip|cual es mi ip/.test(lower)) {
      return { action: 'PUBLIC_IP', params: {}, speak: 'Consultando tu IP...' };
    }

    const appMatch = lower.match(/abre?\s*(?:el|la|el programa|la aplicación)?\s*(.+)/i);
    if (appMatch) {
      const app = appMatch[1].trim();
      if (app.length > 2 && app.length < 40 && !/vpn|clima|noticia|seguridad|ip/.test(app)) {
        return { action: 'OPEN_APP', params: { name: app }, speak: `Abriendo ${app}...` };
      }
    }

    if (/silencio|mutear|silenciar|sin volumen/i.test(lower)) {
      if (this.volumeController) {
        this.volumeController.mute();
      }
      return { speak: 'Silenciando...' };
    }

    if (/qu\u00e9 perfil|perfil activo|qu\u00e9 modo/i.test(lower)) {
      const p = this.profileManager?.getActiveProfile();
      return { speak: p ? `El perfil activo es ${p.name}.` : 'No hay perfil activo.' };
    }

    const volMatch = lower.match(/volumen\s*(?:a\s*|al\s*)?(\d+)/i);
    if (volMatch) {
      const level = parseInt(volMatch[1], 10);
      return { action: 'SET_VOLUME', params: { level }, speak: `Volumen al ${level}%.` };
    }

    if (/bloquea|bloquear/.test(lower) && /pantalla|sesión|sesion/.test(lower)) {
      return { action: 'LOCK', params: {}, speak: `Bloqueando pantalla ${userName}.` };
    }

    if (/apagar|shutdown/.test(lower) && /sistema|equipo|pc|computador/.test(lower)) {
      return { action: 'SHUTDOWN', params: {}, speak: `¿Seguro ${userName}? ¿Apago el equipo?` };
    }

    const emailMatch = lower.match(/(?:breach|filtración|filtracion|pwned|hackeado)\s*(?:de\s*)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch || /breach|filtración|pwned/i.test(lower)) {
      const email = emailMatch?.[1] || '';
      return { action: 'BREACH_CHECK', params: { email }, speak: email ? `Verificando ${email}...` : '¿Qué email quieres verificar?' };
    }

    // VERIFICAR DOMINIO EN BLACKLIST LOCAL
    if ((/verifica|analiza|investiga|es seguro/i.test(lower)) && (/dominio|sitio|web|url/i.test(lower))) {
      const domainMatch = lower.match(/(?:dominio|sitio|web|url)\s+([a-z0-9.-]+\.[a-z]{2,})/i);
      if (domainMatch && this.threatIntel) {
        const domain = domainMatch[1];
        const blacklisted = this.threatIntel.isDomainBlacklisted(domain);
        return { speak: blacklisted ? `${domain} est\u00e1 en mi lista negra. Te recomiendo no acceder a ese sitio.` : `${domain} no aparece en mi lista negra. Aunque siempre ten precauci\u00f3n.` };
      }
    }

    // RESUMEN DE TR\u00c1FICO
    if (/resumen de red|tr\u00e1fico de hoy|c\u00f3mo est\u00e1 la red/i.test(lower)) {
      if (!this.trafficLogger || !this.threatIntel) return null;
      const summary = this.trafficLogger.getDailySummary();
      const threatStats = this.threatIntel.getStats();
      return { speak: `Hoy registr\u00e9 ${summary.samples} muestras de red. Pico de descarga: ${(summary.peakRx / 1024 / 1024).toFixed(2)} MB/s. ${summary.alerts > 0 ? `Tuve ${summary.alerts} alertas.` : 'Sin alertas.'} Mi lista negra tiene ${threatStats.domains} dominios maliciosos.` };
    }

    // ACTUALIZAR BLACKLIST
    if (/actualiza blacklist|actualiza lista negra|actualiza amenazas/i.test(lower)) {
      if (!this.threatIntel) return null;
      return { action: 'UPDATE_BLACKLIST', params: {}, speak: 'Actualizando lista negra...' };
    }

    return null;
  }

  async executeAction(action, params, speakText) {
    let result;

    switch (action) {
      case 'VPN_ON': {
        const { execSync } = require('child_process');
        try {
          const vpnList = execSync('powershell "Get-VpnConnection | Select-Object -ExpandProperty Name"', { timeout: 5000 }).toString().trim();
          if (vpnList) {
            const vpnName = vpnList.split('\n')[0].trim();
            execSync(`powershell "rasdial \\\"${vpnName}\\\""`, { timeout: 15000 });
            result = { speak: `VPN ${vpnName} activada.` };
          } else {
            result = { speak: 'No hay VPN configurada en el sistema.' };
          }
        } catch (e) {
          result = { speak: 'No pude activar la VPN.' };
        }
        break;
      }

      case 'VPN_OFF': {
        const { execSync } = require('child_process');
        try {
          const vpnList = execSync('powershell "Get-VpnConnection | Select-Object -ExpandProperty Name"', { timeout: 5000 }).toString().trim();
          if (vpnList) {
            const vpnName = vpnList.split('\n')[0].trim();
            execSync(`powershell "rasdial \\\"${vpnName}\\\" /disconnect"`, { timeout: 10000 });
            result = { speak: `VPN ${vpnName} desactivada.` };
          } else {
            result = { speak: 'No hay VPN activa.' };
          }
        } catch (e) {
          result = { speak: 'No pude desactivar la VPN.' };
        }
        break;
      }

      case 'SYSTEM_STATS': {
        const report = await this.system.getSystemReport();
        result = { speak: report };
        break;
      }

      case 'WEATHER': {
        const weather = await this.intel.getWeather(params.city);
        if (weather.error) {
          result = { speak: weather.error };
        } else {
          result = { speak: `Clima en ${weather.location}: ${weather.description}. Temperatura: ${weather.temp}°C (sensación ${weather.feelsLike}°C). Humedad: ${weather.humidity}%. Viento: ${weather.windSpeed} km/h.` };
        }
        break;
      }

      case 'SECURITY_NEWS': {
        const news = await this.intel.getSecurityNews();
        if (news.length === 0) {
          result = { speak: 'No pude obtener noticias de seguridad ahora.' };
        } else {
          const top = news.slice(0, 3);
          result = { speak: `Noticias de seguridad: ${top.map((n, i) => `${i + 1}. ${n.title}`).join('. ')}` };
        }
        break;
      }

      case 'DOMAIN_INVESTIGATE': {
        const investigation = await this.intel.investigateDomain(params.domain);
        result = { speak: investigation.message || investigation.error || `No pude investigar ${params.domain}.` };
        this.memory.saveMemory({
          type: 'EVENT',
          content: `Investigación: ${params.domain} → ${investigation.malicious ? 'MALICIOSO' : 'Seguro'}`,
          importance: 0.7,
          tags: 'investigation,domain,security',
        });
        break;
      }

      case 'PUBLIC_IP': {
        const ipData = await this.intel.getPublicIp();
        const parts = [`Tu IP pública es ${ipData.ip}`];
        if (ipData.city) parts.push(`(${ipData.city}${ipData.country ? `, ${ipData.country}` : ''})`);
        if (ipData.org) parts.push(`Proveedor: ${ipData.org}`);
        result = { speak: parts.join(' ') };
        break;
      }

      case 'OPEN_APP': {
        const appResult = await this.system.openApp(params.name);
        result = { speak: appResult.message };
        break;
      }

      case 'SET_VOLUME': {
        if (this.volumeController) {
          const v = await this.volumeController.setVolume(params.level);
          result = { speak: v.success ? `Volumen al ${params.level}%` : `No pude ajustar el volumen. ${v.error || ''}` };
        } else {
          const volResult = await this.system.setVolume(params.level);
          result = { speak: volResult.ok ? `Volumen al ${params.level}%` : volResult.message };
        }
        break;
      }

      case 'LOCK': {
        const lockResult = await this.system.lockWorkstation();
        result = { speak: lockResult.message };
        break;
      }

      case 'SHUTDOWN': {
        const shutdownResult = await this.system.shutdown();
        result = { speak: shutdownResult.message };
        break;
      }

      case 'MEMORY_RECALL': {
        const memories = this.memory.recall(params.query, 8);
        if (memories.length === 0) {
          result = { speak: 'No recuerdo nada relevante sobre eso.' };
        } else {
          result = { speak: `Recuerdo: ${memories.slice(0, 4).map(m => m.content.substring(0, 120)).join('. ')}` };
        }
        break;
      }

      case 'BREACH_CHECK': {
        if (!params.email) {
          result = { speak: '¿Qué email quieres verificar?' };
        } else {
          const breach = await this.intel.checkBreach(params.email);
          result = { speak: breach.message || breach.error || 'No pude verificar el email.' };
        }
        break;
      }

      case 'UPDATE_BLACKLIST': {
        if (!this.threatIntel) {
          result = { speak: 'El sistema de inteligencia de amenazas no está disponible.' };
        } else {
          const r = await this.threatIntel.updateFromURLhaus();
          result = { speak: r.error ? `No pude actualizar la lista ahora. ${r.error}` : `Lista actualizada. Agregu\u00e9 ${r.added} nuevos dominios. Total: ${r.total}.` };
        }
        break;
      }

      default:
        result = { speak: speakText || 'No reconozco esa acci\u00f3n.' };
    }

    if (!result.error) {
      this.brain.mood = 'SATISFECHO';
    }

    return result;
  }

  _random(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}

module.exports = { ActionEngine };
