# Voice Transcriber for OpenCode (voicecode)

**Date:** 2026-07-05
**Status:** Design Spec

## Overview

A Python system-tray tool that captures microphone audio, transcribes it offline using `faster-whisper`, and auto-types the transcribed text into the active window (e.g., the OpenCode TUI). No cloud services, no data leaves the machine.

## Hotkey

- **`Ctrl+Shift+Space`** — toggle recording
  - Press once → starts recording (icon turns red)
  - Press again → stops recording → transcribes → text is typed at cursor

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  pyaudio     │ ──▶ │  faster-whisper   │ ──▶ │  keyboard.send()  │
│  (mic input) │     │  tiny.en model    │     │  (auto-type)      │
└─────────────┘     └──────────────────┘     └──────────────────┘
```

- **pyaudio** — captures raw audio from default microphone
- **faster-whisper** — runs the `tiny.en` Whisper model locally via CTranslate2 (fast CPU inference)
- **keyboard** — listens for the global hotkey and types the result at the cursor position
- **pystray + Pillow** — system tray icon for background operation

## Files

| File | Purpose |
|------|---------|
| `voicecode.py` | Entry point — tray icon, hotkey registration, main loop |
| `transcriber.py` | Audio recording + Whisper transcription logic |
| `requirements.txt` | Python dependencies |

## Behavior

1. Launch `python voicecode.py` → tray icon appears (blue/grey mic icon)
2. Hit `Ctrl+Shift+Space` → icon turns red → audio recording begins
3. Hit `Ctrl+Shift+Space` again → recording stops → spinner/processing state → `tiny.en` transcribes → text is typed at cursor
4. Recording is capped at 30 seconds to prevent hanging
5. Right-click tray icon → "Quit" to exit

## Dependencies

```txt
faster-whisper>=1.0.0
pyaudio>=0.2.11
keyboard>=0.13.5
pystray>=0.19.4
Pillow>=10.0.0
```

## Edge Cases & Error Handling

| Situation | Behavior |
|-----------|----------|
| No microphone found | Tray notification: "No microphone detected." |
| Recording > 30s | Auto-stops, transcribes what it captured |
| Transcription fails | Shows error notification, discards audio |
| Hotkey conflict | Logs a warning, continues trying |
| Model not downloaded | Auto-downloads on first run (~75MB) |

## Caveats

- `keyboard` library requires admin privileges for global hotkeys on Windows. Run as admin or use a non-global listener fallback.
- First run downloads the `tiny.en` model (~75MB).
- ~1-2s latency for short prompts on modern CPUs.
- Works with any focused text input — not limited to OpenCode.
