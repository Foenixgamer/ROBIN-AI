# Robin Desktop — Electron + Node.js

## Requisitos

- **Node.js** v18+ (recomendado v20 LTS)
- **npm** v9+
- **Python** 3.8+ (para edge-tts)
- **edge-tts** (voz neural): `pip install edge-tts`
- Opcional: **Claude API Key** (para respuestas con IA avanzada)

## Instalación

```bash
cd robin-desktop
npm install
```

Esto instala:
- `electron` — runtime de escritorio
- `better-sqlite3` — base de datos local (memoria persistente)
- `keytar` — credenciales cifradas en Windows Credential Store
- `systeminformation` — monitoreo de CPU, RAM, red, disco
- `node-fetch` — llamadas HTTP a APIs externas
- `@anthropic-ai/sdk` — Claude API para inteligencia conversacional

## Desarrollo

```bash
# Modo desarrollo (con herramientas de desarrollo)
npm run dev

# Equivalente a:
# electron . --dev
```

Para desarrollo, el flag `--dev` abre DevTools automáticamente.

## Build

```bash
# Generar .exe portátil (no requiere instalación)
npm run build

# Generar instalador NSIS
npm run build:installer
```

Los ejecutables se generan en `dist/`.

## Uso

1. **Iniciar**: `npm start` o ejecutar `Robin Security Assistant.exe`
2. **Voz**: Presiona el micrófono en la pantalla de Voz o activa "Manos libres"
3. **Chat**: Botón flotante o atajo de teclado
4. **Vault**: Guarda credenciales cifradas en Windows Credential Store
5. **Claude API**: En Ajustes → "Claude API Key" para respuestas con IA

## Comandos de voz disponibles

| Comando | Acción |
|---------|--------|
| "Robin, estado del sistema" | Muestra CPU, RAM, disco, procesos |
| "Robin, clima en [ciudad]" | Consulta el clima en wttr.in |
| "Robin, noticias de seguridad" | Últimas noticias ESET |
| "Robin, investiga [dominio]" | Verifica dominio en URLhaus |
| "Robin, cuál es mi IP" | IP pública + geolocalización |
| "Robin, abre [app]" | Abre Chrome, Edge, Notepad, etc. |
| "Robin, bloquea pantalla" | Bloquea Windows |
| "Robin, qué recuerdas" | Recupera memorias guardadas |
| "Robin, volumen al 50" | Cambia volumen del sistema |
| "Hola Robin" | Conversación normal |

## Arquitectura

```
robin-desktop/
├── package.json                # Dependencias y scripts
├── main.js                     # Proceso principal Electron
├── preload.js                  # Bridge seguro (contextBridge)
├── INSTRUCTIONS.md             # Este archivo
├── renderer/
│   ├── index.html              # UI (JARVIS-style, igual que Android)
│   └── robin.js                # Lógica del renderer (voz, UI, eventos)
├── core/
│   ├── RobinBrain.js           # Consciencia + personalidad + Claude
│   ├── MemoryEngine.js         # SQLite persistente (better-sqlite3)
│   ├── VoiceEngine.js          # TTS con edge-tts (voces neurales)
│   ├── ActionEngine.js         # Procesador de comandos
│   ├── SystemController.js     # Control de Windows (apps, volumen, etc.)
│   ├── Intelligence.js         # APIs externas (clima, noticias, IP, threat)
│   ├── NetworkMonitor.js       # Monitoreo de red en tiempo real
│   └── VaultManager.js         # Credenciales cifradas (keytar)
├── db/                         # SQLite database (auto-creado)
└── assets/                     # Íconos y recursos
```

## Equivalencia Android → Desktop

| Android (Kotlin) | Desktop (Node.js) |
|-----------------|-------------------|
| SpeechRecognizer + wake word | Web Speech API (Chromium) |
| Android TTS | edge-tts (Microsoft neural voices) |
| Room Database | better-sqlite3 |
| Android Keystore | keytar (Windows Credential Store) |
| VpnService | WinDivert / placeholder |
| System (CPU/RAM/battery) | systeminformation |
| RobinBridge (JavascriptInterface) | contextBridge + ipcRenderer |
| ConsciousnessEngine + Personality | RobinBrain.js |
| Intelligence (wttr.in, URLhaus, etc.) | Intelligence.js (node-fetch) |

## Notas

- **TTS**: edge-tts requiere Python. Si no está instalado, el sistema funcionará sin audio.
- **Vault**: keytar usa Windows Credential Store. Si no está disponible (entorno restringido), usa fallback cifrado AES-256 en archivo local.
- **Wake word**: El reconocimiento de voz se activa manualmente o en modo "manos libres". La wake word "Robin" no está implementada aún (el Web Speech API no soporta wake words continuas de forma nativa).
