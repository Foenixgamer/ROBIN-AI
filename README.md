# Robin — AI Desktop Operating System

**Robin** is an AI-native desktop environment that transforms how you interact with your computer. Fully voice‑operated, privacy‑first, and built for intelligent system management and security.

Instead of clicking menus or typing commands, you talk to Robin like a teammate. She monitors your system, protects your network, manages your credentials, automates tasks, and adapts to your context — all through natural conversation.

---

## Core Philosophy

- **Voice‑first, zero click** — No menus, no buttons. Every interaction is a conversation.
- **Security as a reflex** — Real‑time network analysis, process monitoring, threat intelligence, and encrypted vault, always running.
- **Context‑aware** — Profiles adapt your environment (work, home, night, travel). Automation triggers actions based on time and behavior.
- **Privacy by design** — All processing stays local. API keys are encrypted at rest. The vault uses AES‑256‑GCM with hardware‑backed key storage.

---

## Features

### Voice Control
- Always‑listening interface with frequency‑domain VAD (voice activity detection)
- Groq Whisper STT → Natural language understanding → TTS response
- Orb visualization with emotional states and mood‑driven prosody

### System Management
- Launch apps, adjust volume, lock screen, shutdown
- Real‑time system stats (CPU, RAM, network, uptime)
- Multi‑monitor fullscreen with frameless window

### Network Security
- Baseline learning + anomaly detection on traffic patterns
- Real‑time alerts for RX/TX spikes with process correlation
- Integration with URLhaus threat intelligence feed

### Process Monitoring
- Scans for 10+ suspicious process patterns (mimikatz, metasploit, cobalt strike, etc.)
- Process‑level CPU/RAM abuse detection
- Kill malicious processes by voice command

### Encrypted Vault
- AES‑256‑GCM with random IV + auth tag (industry standard)
- Master key stored in Windows Credential Store (keytar) with file fallback
- Dual‑API: simple secrets for API keys, full credential management for passwords
- Secure password generator with configurable character sets
- Encrypted backup/restore with auto‑backup weekly

### Context Profiles
- **Trabajo**: 40% volume, important notifications only, blocks games, 15min auto‑lock, VPN recommended
- **Casa**: 70% volume, all notifications, relaxed security
- **Noche**: 20% volume, silent mode, blocks distracting apps, aggressive auto‑lock
- **Viaje**: 50% volume, maximum monitoring, 5min auto‑lock, aggressive threat alerts

### Automations
- Time‑based triggers ("at 23:00 activate night profile")
- Interval triggers ("every 60 minutes remind me to rest")
- Action types: profile activation, text‑to‑speech, screen lock

### Alarms & Reminders
- Natural language parsing: *"recuérdame comprar leche a las 3 pm"*
- Windows toast notifications
- Daily repeat option

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    main.js                           │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────────┐  │
│  │  Voice   │ │  Speech  │ │    ActionEngine      │  │
│  │  Engine  │ │  Engine  │ │  (intent routing)    │  │
│  └────┬─────┘ └────┬─────┘ └──┬──────┬──────┬─────┘  │
│       │            │          │      │      │        │
│  ┌────▼────────────▼──────────▼──────▼──────▼─────┐  │
│  │              RobinBrain (AI core)              │  │
│  │  Claude / OpenRouter / Groq / Gemini cascade   │  │
│  └───────────────────────┬────────────────────────┘  │
│                          │                           │
│  ┌───────────────────────▼────────────────────────┐  │
│  │          MemoryEngine (SQLite persistence)     │  │
│  └───────────────────────┬────────────────────────┘  │
│                          │                           │
│  ┌──────────┐ ┌──────────▼────────┐ ┌────────────┐  │
│  │  Vault   │ │  Security Modules │ │  Profiles  │  │
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

### Voice Pipeline
```
Microphone → MediaRecorder → Audio → Groq Whisper → ActionEngine
                                                          │
                                             ┌────────────┴────────────┐
                                             ▼                        ▼
                                     Pre‑brain detection      brain.think()
                                     (direct commands,         (AI response)
                                      flexible intents)
                                             │                        │
                                             └────────────┬────────────┘
                                                          ▼
                                                  Post‑brain override
                                                  (_detectCommand)
                                                          │
                                                          ▼
                                                  Execute action / Speak
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Set your API key (Groq for STT)
set ROBIN_GROQ_KEY=gsk_your_key_here

# Launch Robin
npm start
```

### Environment Variables
| Variable | Purpose |
|---|---|
| `ROBIN_GROQ_KEY` | Speech‑to‑text (Groq Whisper) |
| `ROBIN_OPENROUTER_KEY` | LLM via OpenRouter |
| `ROBIN_ANTHROPIC_KEY` | Claude Sonnet |
| `ROBIN_GOOGLE_KEY` | Gemini + Safe Browsing |

Keys are automatically provisioned to the encrypted vault on first run.

---

## Voice Command Reference

### System
| Command | Action |
|---|---|
| "Qué hora es" | Current time |
| "Clima en Santo Domingo" | Weather |
| "Bloquea la pantalla" | Lock workstation |
| "Abre Chrome" | Launch application |
| "Sube el volumen" / "Baja el volumen" | Volume control |
| "Volumen al 50" | Set exact volume |
| "Estado del sistema" | System report |

### Security
| Command | Action |
|---|---|
| "Escanea procesos" | Scan for suspicious processes |
| "Analiza mi sistema" | Full system analysis |
| "Mi IP pública" | Show public IP |
| "Verifica dominio example.com" | Check domain against blacklist |
| "Actualiza lista negra" | Sync URLhaus threat feed |
| "Resumen de red" | Daily traffic summary |

### Vault
| Command | Action |
|---|---|
| "Guarda contraseña de Gmail" | Start credential save flow |
| "Busca contraseña de Netflix" | Retrieve credential (copies to clipboard, auto‑clears in 30s) |
| "Lista mis cuentas" | Show all stored services |
| "Genera una contraseña segura" | Generate random password |
| "Elimina contraseña de Spotify" | Remove credential |
| "Backup del vault" | Export encrypted backup |

### Profiles
| Command | Action |
|---|---|
| "Modo trabajo" | Work profile (focused, minimal distractions) |
| "Modo casa" | Home profile (relaxed) |
| "Modo noche" | Night profile (silent, blocked apps) |
| "Modo viaje" | Travel profile (maximum security) |
| "Qué perfil está activo" | Show current profile |

### Alarms & Automations
| Command | Action |
|---|---|
| "Recuérdame llamar a las 5 pm" | Create reminder |
| "Crea alarma para las 7 am" | Create daily alarm |
| "Lista automatizaciones" | Show active automations |

---

## Tech Stack

- **Runtime**: Node.js 24 + Electron 42
- **Voice**: MediaRecorder + Groq Whisper (`whisper‑large‑v3‑turbo`)
- **AI**: Anthropic Claude, Google Gemini, OpenRouter, Groq (cascade fallback)
- **TTS**: Edge‑TTS (Python)
- **Database**: SQLite (`better‑sqlite3`)
- **Security**: AES‑256‑GCM, keytar (Windows Credential Store)
- **Networking**: `systeminformation`, `node‑fetch`
- **Visual**: Canvas 2D (orb), CSS backdrop‑blur (side panel)

---

## License

MIT
