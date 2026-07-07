# Voice Transcriber for OpenCode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Python system-tray tool that captures microphone audio, transcribes it offline via `faster-whisper`, and auto-types the result into the active window (OpenCode TUI).

**Architecture:** Two modules — `transcriber.py` handles audio capture + Whisper inference, `voicecode.py` owns the tray icon, hotkey listener, and state machine. Both run in a single process with `keyboard` hotkey callbacks driving recording state.

**Tech Stack:** Python 3.9+, faster-whisper, pyaudio, keyboard, pystray, Pillow

## Global Constraints

- All transcription must be offline/local — no network calls
- Hotkey: `Ctrl+Shift+Space` toggle (start/stop recording)
- Model: `tiny.en` (~75MB, auto-downloads on first run)
- Recording capped at 30 seconds
- Auto-type transcribed text at cursor position
- Files go in `tools/voicecode/`

---

### Task 1: Project Scaffold + Transcriber Module

**Files:**
- Create: `tools/voicecode/requirements.txt`
- Create: `tools/voicecode/transcriber.py`
- Create: `tools/voicecode/__init__.py`

**Interfaces:**
- Produces: `VoiceTranscriber` class with `start_recording()`, `stop_and_transcribe() -> str`

- [ ] **Step 1: Create the directory and `__init__.py`**

```
New-Item -ItemType Directory -Path tools/voicecode -Force
```

- [ ] **Step 2: Write `requirements.txt`**

```txt
faster-whisper>=1.0.0
pyaudio>=0.2.11
keyboard>=0.13.5
pystray>=0.19.4
Pillow>=10.0.0
```

- [ ] **Step 3: Write `transcriber.py`**

```python
"""Audio recording and offline transcription via faster-whisper."""
import threading
import pyaudio
import numpy as np
from faster_whisper import WhisperModel


class VoiceTranscriber:
    """Captures mic audio and transcribes it using a local Whisper model."""

    def __init__(self, model_size: str = "tiny.en", sample_rate: int = 16000):
        self.model_size = model_size
        self.sample_rate = sample_rate
        self._model: WhisperModel | None = None
        self._audio_frames: list[bytes] = []
        self._is_recording = False
        self._thread: threading.Thread | None = None

    # ── lazy model load ──────────────────────────────────────────
    @property
    def model(self) -> WhisperModel:
        if self._model is None:
            self._model = WhisperModel(self.model_size, device="cpu", compute_type="int8")
        return self._model

    # ── public API ───────────────────────────────────────────────
    def start_recording(self) -> None:
        """Begin capturing audio from the default microphone."""
        self._audio_frames = []
        self._is_recording = True
        self._thread = threading.Thread(target=self._record_loop, daemon=True)
        self._thread.start()

    def stop_and_transcribe(self) -> str:
        """Stop recording, transcribe audio, return the text."""
        self._is_recording = False
        if self._thread:
            self._thread.join(timeout=5.0)

        if not self._audio_frames:
            return ""

        raw = np.frombuffer(b"".join(self._audio_frames), dtype=np.int16)
        audio = raw.astype(np.float32) / 32768.0

        segments, _ = self.model.transcribe(audio, language="en")
        return " ".join(seg.text.strip() for seg in segments).strip()

    # ── internal ─────────────────────────────────────────────────
    def _record_loop(self) -> None:
        p = pyaudio.PyAudio()
        try:
            stream = p.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=self.sample_rate,
                input=True,
                frames_per_buffer=1024,
            )
            frames_collected = 0
            max_frames = int(30 * self.sample_rate / 1024)  # 30-second cap

            while self._is_recording and frames_collected < max_frames:
                data = stream.read(1024, exception_on_overflow=False)
                self._audio_frames.append(data)
                frames_collected += 1

            stream.stop_stream()
            stream.close()
        finally:
            p.terminate()
```

- [ ] **Step 4: Verify the module imports cleanly**

Run:
```powershell
cd tools/voicecode
python -c "from transcriber import VoiceTranscriber; print('OK')"
```

Expected: `OK` (model download will happen on first actual use, not on import)

- [ ] **Step 5: Commit**

```bash
git add tools/voicecode/
git commit -m "feat(voicecode): add transcriber module"
```

---

### Task 2: Main App — Tray Icon + Hotkey + Wiring

**Files:**
- Create: `tools/voicecode/voicecode.py`

**Interfaces:**
- Consumes: `VoiceTranscriber` (from Task 1)
- Produces: runnable `python voicecode.py` entry point

- [ ] **Step 1: Write `voicecode.py`**

```python
"""Voice transcriber system-tray app for OpenCode.

Press Ctrl+Shift+Space to toggle recording.
Transcribed text is auto-typed at the cursor position.
"""
import sys
import threading
import keyboard
import pystray
from PIL import Image, ImageDraw
from transcriber import VoiceTranscriber


# ── icon helpers ─────────────────────────────────────────────────

def _make_icon(color: str) -> Image.Image:
    """16x16 microphone icon in the given colour."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # simple mic shape
    draw.rectangle((5, 2, 11, 10), fill=color)          # body
    draw.rectangle((4, 9, 12, 11), fill=color)          # base
    draw.rectangle((6, 11, 10, 14), fill=color)          # stem
    draw.ellipse((6, 13, 10, 15), fill=color)            # foot
    return img


IDLE_ICON = _make_icon("#888")
REC_ICON = _make_icon("#e33")
BUSY_ICON = _make_icon("#fa0")


# ── app ─────────────────────────────────────────────────────────

class VoiceCodeApp:
    """Tray application for voice-to-text via hotkey."""

    def __init__(self):
        self._transcriber = VoiceTranscriber()
        self._recording = False
        self._icon: pystray.Icon | None = None

    # ── public ──────────────────────────────────────────────────

    def run(self) -> None:
        """Start the tray icon and hotkey listener (blocks)."""
        self._icon = pystray.Icon(
            "voicecode",
            IDLE_ICON,
            "VoiceCode (Ctrl+Shift+Space)",
            menu=pystray.Menu(pystray.MenuItem("Quit", self._quit)),
        )
        keyboard.add_hotkey("ctrl+shift+space", self._toggle, suppress=True)
        self._icon.run()

    # ── internal ────────────────────────────────────────────────

    def _toggle(self) -> None:
        """Start or stop recording based on current state."""
        if self._recording:
            self._stop_recording()
        else:
            self._start_recording()

    def _start_recording(self) -> None:
        self._recording = True
        self._update_icon(REC_ICON, "VoiceCode — Recording...")
        self._transcriber.start_recording()

    def _stop_recording(self) -> None:
        self._recording = False
        self._update_icon(BUSY_ICON, "VoiceCode — Transcribing...")
        try:
            text = self._transcriber.stop_and_transcribe()
        except Exception as exc:
            print(f"[voicecode] Transcription error: {exc}")
            self._update_icon(IDLE_ICON, "VoiceCode — Error (see terminal)")
            return

        if text:
            # type text in a background thread to avoid blocking the tray
            threading.Thread(target=self._type_text, args=(text,), daemon=True).start()
        else:
            self._update_icon(IDLE_ICON, "VoiceCode (Ctrl+Shift+Space)")

    def _type_text(self, text: str) -> None:
        keyboard.write(text)
        self._update_icon(IDLE_ICON, "VoiceCode (Ctrl+Shift+Space)")

    def _update_icon(self, icon_img: Image.Image, tooltip: str) -> None:
        if self._icon:
            self._icon.icon = icon_img
            self._icon.title = tooltip

    def _quit(self) -> None:
        if self._recording:
            self._transcriber.stop_and_transcribe()
        if self._icon:
            self._icon.stop()


# ── entry point ─────────────────────────────────────────────────

def main() -> None:
    app = VoiceCodeApp()
    try:
        app.run()
    except PermissionError:
        import tkinter.messagebox as mb
        mb.showerror(
            "VoiceCode",
            "Global hotkey requires admin privileges.\n"
            "Run PowerShell/Terminal as Administrator and try again.",
        )
    except Exception as exc:
        print(f"[voicecode] Fatal error: {exc}")
        raise


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Verify it can be started (exit immediately test)**

Run this simple smoke test:
```powershell
cd tools/voicecode
python -c "from voicecode import VoiceCodeApp; print('App class loaded OK')"
```
Expected: `App class loaded OK`

- [ ] **Step 3: Commit**

```bash
git add tools/voicecode/voicecode.py
git commit -m "feat(voicecode): add tray app with hotkey"
```

---

### Task 3: Manual Integration Verification

**Files:** (none — manual testing)

- [ ] **Step 1: Install dependencies**

```powershell
cd tools/voicecode
pip install -r requirements.txt
```

Expected: all packages install without errors.

- [ ] **Step 2: Run the app**

```powershell
cd tools/voicecode
python voicecode.py
```

- [ ] **Step 3: Test the hotkey**

  1. Focus any text input (Notepad, OpenCode TUI, browser)
  2. Press `Ctrl+Shift+Space` — icon should turn red
  3. Speak a short phrase ("hello world")
  4. Press `Ctrl+Shift+Space` again — icon turns orange briefly, then grey
  5. Text appears at cursor

- [ ] **Step 4: Right-click tray icon → Quit**

App exits cleanly.

---

### Task 4: Admin Rights Note + Documentation

**Files:**
- Create: `tools/voicecode/README.md`

- [ ] **Step 1: Write README.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add tools/voicecode/README.md
git commit -m "docs(voicecode): add usage README"
```
