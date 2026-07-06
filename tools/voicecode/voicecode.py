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
