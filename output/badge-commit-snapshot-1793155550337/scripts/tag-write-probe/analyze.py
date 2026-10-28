"""Locate source samples in speaker loopback without a periodic-tone ambiguity."""
import json
import pathlib
import sys
import numpy as np

root = pathlib.Path(sys.argv[1]).resolve()
rate = 48000
reference = np.fromfile(root / "reference.raw", dtype="<i2").reshape(-1, 2).astype(float)
captured = np.load(root / "loopback.npy")
# The difference also suppresses unrelated centred audio on the output device.
x = reference[:, 0] - reference[:, 1]
y = captured[:, 0] - captured[:, 1]
width = rate // 4
pattern = x[rate:rate + width]
size = 1 << (len(y) + width - 1).bit_length()
correlation = np.fft.irfft(np.fft.rfft(y, size) * np.fft.rfft(pattern[::-1], size), size)
origin = int(np.argmax(correlation[width - 1:len(y)]) - rate)
offsets = []
for position in np.arange(1., 18., .25):
    frame = int(position * rate)
    if frame + origin + width + 150 >= len(y):
        break
    pattern = x[frame:frame + width]
    low = frame + origin - 150
    region = y[low:frame + origin + width + 150]
    matches = np.correlate(region, pattern, mode="valid")
    offset = int(np.argmax(matches))
    actual = region[offset:offset + width]
    score = float(np.dot(actual, pattern) / np.sqrt(np.dot(actual, actual) * np.dot(pattern, pattern)))
    offsets.append({"time": float(position), "offsetFrames": low + offset - frame, "correlation": score})
report = {"originFrames": origin, "offsets": offsets,
          "offsetSpreadFrames": max(v["offsetFrames"] for v in offsets) - min(v["offsetFrames"] for v in offsets)}
(root / "alignment.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
