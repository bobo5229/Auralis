"""Align only the test process tree's WASAPI loopback with its source PCM."""
import json
from pathlib import Path
import sys
import numpy as np

root = Path(sys.argv[1]).resolve()
seconds = int(sys.argv[2])
rate = 48000
reference = np.fromfile(root / 'reference.f32', dtype='<f4').reshape(-1, 2).astype(float)
captured = np.fromfile(root / 'loopback.f32', dtype='<f4').reshape(-1, 2)
x = reference[:, 0] - reference[:, 1]
y = captured[:, 0] - captured[:, 1]
width = rate // 4
pattern = x[rate:rate + width]
size = 1 << (len(y) + width - 1).bit_length()
cc = np.fft.irfft(np.fft.rfft(y, size) * np.fft.rfft(pattern[::-1], size), size)
origin = int(np.argmax(cc[width - 1:len(y)]) - rate)
offsets = []
# Search +/- 0.1 seconds so a real discontinuity cannot hide outside a tiny search window.
radius = rate // 10
for position in np.arange(1., seconds - 1., .25):
    frame = int(position * rate)
    low = max(0, frame + origin - radius)
    high = min(len(y), frame + origin + width + radius)
    pattern = x[frame:frame + width]
    region = y[low:high]
    # FFT correlation avoids quadratic cost for the wider search range.
    n = 1 << (len(region) + width - 1).bit_length()
    corr = np.fft.irfft(np.fft.rfft(region, n) * np.fft.rfft(pattern[::-1], n), n)
    matches = corr[width - 1:len(region)]
    offset = int(np.argmax(matches))
    actual = region[offset:offset + width]
    score = float(np.dot(actual, pattern) / np.sqrt(np.dot(actual, actual) * np.dot(pattern, pattern)))
    offsets.append({'time': float(position), 'offsetFrames': low + offset - frame, 'correlation': score})
energy = np.sqrt(np.mean(captured[:len(captured) // 240 * 240].reshape(-1, 240, 2) ** 2, axis=(1, 2)))
active = np.flatnonzero(energy > max(.00001, np.max(energy) * .1))
if not len(active):
    raise RuntimeError('No test signal detected')
silent = int(np.sum(energy[active[0]:active[-1] + 1] < np.max(energy) * .01))
result = {'originFrames': origin, 'offsetSpreadFrames': max(v['offsetFrames'] for v in offsets) - min(v['offsetFrames'] for v in offsets),
          'minCorrelation': min(v['correlation'] for v in offsets), 'silent5msWindowsInsideSignal': silent,
          'peak': float(np.max(np.abs(captured))), 'offsets': offsets}
(root / 'alignment.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result))
if result['offsetSpreadFrames'] > 2 or result['minCorrelation'] < .99 or silent:
    raise SystemExit('Speaker continuity check failed')
