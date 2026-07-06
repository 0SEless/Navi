# VoiceCode — Voice Transcriber for OpenCode

Offline speech-to-text tool that types your voice into any app.

## Usage

1. Install: `pip install -r requirements.txt`
2. Run: `python voicecode.py`
3. Press `Ctrl+Shift+Space` to start/stop recording
4. Transcribed text appears at cursor

## Admin Rights

The `keyboard` library needs admin privileges for global hotkeys on Windows.
Run PowerShell/Terminal **as Administrator** before launching.

If you prefer not to run as admin, the hotkey will only work when the
terminal window is focused.

## Model

Uses `faster-whisper` with the `tiny.en` model (~75MB). Auto-downloaded
on first transcription. Swap to `small.en` in `VoiceTranscriber()` for
better accuracy (slower, ~500MB).

## Files

- `voicecode.py` — Tray app entry point
- `transcriber.py` — Audio recording + Whisper transcription
- `requirements.txt` — Python dependencies
