"""Capture the default speaker's WASAPI loopback, never a physical microphone."""
import json
import pathlib
import sys
import tempfile
import wave

sys.path.insert(0, str(pathlib.Path(tempfile.gettempdir()) / "auralis-loopback-validation-deps"))
import numpy as np
import soundcard as sc

# SoundCard 0.4.5 uses the removed binary numpy.fromstring API. Adapt only its module.
class _ArrayCompatibility:
    def __getattr__(self, name):
        # fromstring copied the WASAPI buffer before ReleaseBuffer; keep that ownership.
        return (lambda *args, **kwargs: np.frombuffer(*args, **kwargs).copy()) if name == "fromstring" else getattr(np, name)

sc.mediafoundation.numpy = _ArrayCompatibility()

root = pathlib.Path(sys.argv[1]).resolve()
speaker = sc.default_speaker()
if speaker is None:
    raise RuntimeError("No default output device")
loopback = sc.get_microphone(speaker.id, include_loopback=True)
if not loopback.isloopback:
    raise RuntimeError("Refusing to capture a microphone")
with loopback.recorder(samplerate=48000, channels=2, blocksize=256) as recorder:
    (root / "capture-ready").write_text("ready", encoding="utf-8")
    captured = recorder.record(numframes=48000 * 20)
np.save(root / "loopback.npy", captured)
with wave.open(str(root / "loopback.wav"), "wb") as output:
    output.setnchannels(2)
    output.setsampwidth(2)
    output.setframerate(48000)
    output.writeframes((np.clip(captured, -1, 1) * 32767).astype("<i2").tobytes())
energy = np.sqrt(np.mean(captured.reshape(-1, 240, 2) ** 2, axis=(1, 2)))
active = np.flatnonzero(energy > max(.0001, np.max(energy) * .1))
if len(active) == 0:
    raise RuntimeError("Loopback contains no audible test signal")
silence = np.flatnonzero(energy[active[0] : active[-1] + 1] < np.max(energy) * .01)
report = {"device": speaker.name, "sampleRate": 48000, "frames": len(captured),
          "peak": float(np.max(np.abs(captured))), "silent5msWindowsInsideSignal": len(silence),
          "capture": "WASAPI speaker loopback; no microphone"}
(root / "capture.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
if len(silence):
    raise RuntimeError("Unexpected silence inside continuous test audio")
