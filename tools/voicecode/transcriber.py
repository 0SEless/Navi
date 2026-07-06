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
        self._lock = threading.Lock()
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
        with self._lock:
            self._audio_frames = []
        self._is_recording = True
        self._thread = threading.Thread(target=self._record_loop, daemon=True)
        self._thread.start()

    def stop_and_transcribe(self) -> str:
        """Stop recording, transcribe audio, return the text."""
        self._is_recording = False
        if self._thread:
            self._thread.join(timeout=5.0)

        with self._lock:
            if not self._audio_frames:
                return ""
            frames = self._audio_frames[:]

        raw = np.frombuffer(b"".join(frames), dtype=np.int16)
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
                with self._lock:
                    self._audio_frames.append(data)
                frames_collected += 1

            stream.stop_stream()
            stream.close()
        finally:
            p.terminate()
