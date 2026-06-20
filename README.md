# Robin — Sistema Operativo Desktop con IA

**Robin** es un entorno de escritorio nativo con inteligencia artificial que transforma la forma en que interactúas con tu computadora. Completamente operado por voz, centrado en la privacidad, y construido para la gestión inteligente del sistema y la seguridad.

En lugar de hacer clic en menús o escribir comandos, le hablas a Robin como a un compañero de equipo. Ella monitorea tu sistema, protege tu red, gestiona tus credenciales, automatiza tareas y se adapta a tu contexto — todo mediante conversación natural.

---

## Filosofía Central

- **Voz primero, cero clics** — Sin menús, sin botones. Cada interacción es una conversación.
- **Seguridad como reflejo** — Análisis de red en tiempo real, monitoreo de procesos, inteligencia de amenazas y bóveda cifrada, siempre activos.
- **Consciente del contexto** — Perfiles que adaptan tu entorno (trabajo, casa, noche, viaje). Automatizaciones que se activan según hora y comportamiento.
- **Privacidad desde el diseño** — Todo el procesamiento permanece local. Las claves API se cifran en reposo. La bóveda usa AES‑256‑GCM con almacenamiento de clave respaldado por hardware.

---

## Características

### Control por Voz
- Interfaz de escucha permanente con VAD (detección de actividad de voz) por dominio de frecuencia
- Groq Whisper STT → Comprensión de lenguaje natural → Respuesta TTS
- Visualización del orbe con estados emocionales y prosodia impulsada por el estado de ánimo

### Gestión del Sistema
- Abrir apps, ajustar volumen, bloquear pantalla, apagar
- Estadísticas del sistema en tiempo real (CPU, RAM, red, uptime)
- Pantalla completa en múltiples monitores con ventana sin bordes

### Seguridad de Red
- Aprendizaje de línea base + detección de anomalías en patrones de tráfico
- Alertas en tiempo real por picos de RX/TX con correlación de procesos
- Integración con el feed de inteligencia de amenazas URLhaus

### Monitoreo de Procesos
- Escaneo de 10+ patrones de procesos sospechosos (mimikatz, metasploit, cobalt strike, etc.)
- Detección de abuso de CPU/RAM por proceso
- Eliminación de procesos maliciosos mediante comando de voz

### Bóveda Cifrada
- AES‑256‑GCM con IV aleatorio + auth tag (estándar industrial)
- Clave maestra almacenada en Windows Credential Store (keytar) con respaldo en archivo
- API dual: secrets simples para claves API, gestión completa de credenciales para contraseñas
- Generador de contraseñas seguras con conjuntos de caracteres configurables
- Respaldos cifrados con exportación/importación y auto-backup semanal

### Perfiles de Contexto
- **Trabajo**: volumen al 40%, notificaciones solo importantes, bloquea juegos, auto-bloqueo 15min, VPN recomendada
- **Casa**: volumen al 70%, todas las notificaciones, seguridad relajada
- **Noche**: volumen al 20%, modo silencioso, bloquea apps distractoras, auto-bloqueo agresivo
- **Viaje**: volumen al 50%, monitoreo máximo, auto-bloqueo 5min, alertas de amenazas agresivas

### Automatizaciones
- Disparadores por hora ("a las 23:00 activar perfil noche")
- Disparadores por intervalo ("cada 60 minutos recordar descansar")
- Tipos de acción: activar perfil, texto a voz, bloquear pantalla

### Alarmas y Recordatorios
- Análisis de lenguaje natural: *"recuérdame comprar leche a las 3 pm"*
- Notificaciones toast de Windows
- Opción de repetición diaria

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    main.js                           │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────────┐  │
│  │  Voice   │ │  Speech  │ │    ActionEngine      │  │
│  │  Engine  │ │  Engine  │ │  (ruteo de intentos) │  │
│  └────┬─────┘ └────┬─────┘ └──┬──────┬──────┬─────┘  │
│       │            │          │      │      │        │
│  ┌────▼────────────▼──────────▼──────▼──────▼─────┐  │
│  │             RobinBrain (núcleo IA)             │  │
│  │  Claude / OpenRouter / Groq / Gemini cascade   │  │
│  └───────────────────────┬────────────────────────┘  │
│                          │                           │
│  ┌───────────────────────▼────────────────────────┐  │
│  │       MemoryEngine (persistencia SQLite)       │  │
│  └───────────────────────┬────────────────────────┘  │
│                          │                           │
│  ┌──────────┐ ┌──────────▼────────┐ ┌────────────┐  │
│  │  Vault   │ │  Módulos Seguridad│ │  Profiles  │  │
│  │ Manager  │ │ ┌──────────────┐  │ │  Manager   │  │
│  │  (AES)   │ │ │NetworkMonitor│  │ └────────────┘  │
│  └──────────┘ │ │ProcessMonitor│  │ ┌────────────┐  │
│               │ │ThreatIntel   │  │ │Automation  │  │
│               │ │TrafficLogger │  │ │  Engine    │  │
│               │ └──────────────┘  │ └────────────┘  │
│               │                   │ ┌────────────┐  │
│               │                   │ │   Alarm    │  │
│               │                   │ │  Manager   │  │
│               │                   │ └────────────┘  │
│               └───────────────────┘                 │
└─────────────────────────────────────────────────────┘
```

### Pipeline de Voz
```
Micrófono → MediaRecorder → Audio → Groq Whisper → ActionEngine
                                                          │
                                             ┌────────────┴────────────┐
                                             ▼                        ▼
                                     Detección pre-brain      brain.think()
                                     (comandos directos,       (respuesta IA)
                                      detección flexible)
                                             │                        │
                                             └────────────┬────────────┘
                                                          ▼
                                                  Post-brain override
                                                  (_detectCommand)
                                                          │
                                                          ▼
                                                  Ejecutar acción / Hablar
```

---

## Inicio Rápido

```bash
# Instalar dependencias
npm install

# Configurar clave API (Groq para STT)
set ROBIN_GROQ_KEY=gsk_tu_key_aqui

# Iniciar Robin
npm start
```

### Variables de Entorno
| Variable | Propósito |
|---|---|
| `ROBIN_GROQ_KEY` | Voz a texto (Groq Whisper) |
| `ROBIN_OPENROUTER_KEY` | LLM vía OpenRouter |
| `ROBIN_ANTHROPIC_KEY` | Claude Sonnet |
| `ROBIN_GOOGLE_KEY` | Gemini + Safe Browsing |

Las claves se provisioning automáticamente a la bóveda cifrada en el primer inicio.

---

## Referencia de Comandos de Voz

### Sistema
| Comando | Acción |
|---|---|
| "Qué hora es" | Hora actual |
| "Clima en Santo Domingo" | Clima |
| "Bloquea la pantalla" | Bloquear equipo |
| "Abre Chrome" | Abrir aplicación |
| "Sube el volumen" / "Baja el volumen" | Control de volumen |
| "Volumen al 50" | Volumen exacto |
| "Estado del sistema" | Reporte del sistema |

### Seguridad
| Comando | Acción |
|---|---|
| "Escanea procesos" | Buscar procesos sospechosos |
| "Analiza mi sistema" | Análisis completo del sistema |
| "Mi IP pública" | Mostrar IP pública |
| "Verifica dominio example.com" | Revisar dominio contra lista negra |
| "Actualiza lista negra" | Sincronizar feed URLhaus |
| "Resumen de red" | Resumen diario de tráfico |

### Bóveda
| Comando | Acción |
|---|---|
| "Guarda contraseña de Gmail" | Iniciar guardado de credencial |
| "Busca contraseña de Netflix" | Recuperar credencial (copia al portapapeles, auto-limpieza en 30s) |
| "Lista mis cuentas" | Mostrar todos los servicios guardados |
| "Genera una contraseña segura" | Generar contraseña aleatoria |
| "Elimina contraseña de Spotify" | Borrar credencial |
| "Backup del vault" | Exportar respaldo cifrado |

### Perfiles
| Comando | Acción |
|---|---|
| "Modo trabajo" | Perfil trabajo (enfocado, mínimas distracciones) |
| "Modo casa" | Perfil casa (relajado) |
| "Modo noche" | Perfil noche (silencioso, apps bloqueadas) |
| "Modo viaje" | Perfil viaje (seguridad máxima) |
| "Qué perfil está activo" | Mostrar perfil actual |

### Alarmas y Automatizaciones
| Comando | Acción |
|---|---|
| "Recuérdame llamar a las 5 pm" | Crear recordatorio |
| "Crea alarma para las 7 am" | Crear alarma diaria |
| "Lista automatizaciones" | Mostrar automatizaciones activas |

---

## Stack Tecnológico

- **Runtime**: Node.js 24 + Electron 42
- **Voz**: MediaRecorder + Groq Whisper (`whisper‑large‑v3‑turbo`)
- **IA**: Anthropic Claude, Google Gemini, OpenRouter, Groq (cascada con fallback)
- **TTS**: Edge‑TTS (Python)
- **Base de datos**: SQLite (`better‑sqlite3`)
- **Seguridad**: AES‑256‑GCM, keytar (Windows Credential Store)
- **Red**: `systeminformation`, `node‑fetch`
- **Visual**: Canvas 2D (orbe), CSS backdrop‑blur (panel lateral)

---

## Licencia

MIT
