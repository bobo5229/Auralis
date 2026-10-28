"""Check the continuity detector against known synthetic discontinuities."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import numpy as np

root = Path(tempfile.mkdtemp(prefix='auralis-mpv-m4a-calibration-'))
(root / 'ISOLATED_SYNTHETIC_ONLY').touch()
rate = 48000
seconds = 18
reference = np.random.default_rng(12345).normal(0, .02, (rate * seconds, 2)).astype('<f4')
healthy = np.concatenate([np.zeros((2048, 2), dtype='<f4'), reference * .2,
                          np.zeros((4096, 2), dtype='<f4')])
cut = 2048 + 6 * rate
silent = healthy.copy()
silent[cut:cut + 480] = 0
cases = {
    'healthy': healthy,
    'insert-10ms': np.concatenate([healthy[:cut], np.zeros((480, 2), dtype='<f4'), healthy[cut:]]),
    'drop-10ms': np.concatenate([healthy[:cut], healthy[cut + 480:]]),
    'silence-10ms': silent,
}
results = []
for name, samples in cases.items():
    directory = root / name
    directory.mkdir()
    reference.tofile(directory / 'reference.f32')
    samples.astype('<f4').tofile(directory / 'loopback.f32')
    outcome = subprocess.run([sys.executable, str(Path(__file__).with_name('loopback.py')),
                              str(directory), str(seconds)], capture_output=True, text=True)
    alignment = json.loads((directory / 'alignment.json').read_text(encoding='utf-8'))
    detected = outcome.returncode != 0
    if detected != (name != 'healthy'):
        raise RuntimeError(f'{name}: unexpected detector result: {outcome.stderr}')
    results.append({'name': name, 'discontinuityDetected': detected,
                    'offsetSpreadFrames': alignment['offsetSpreadFrames'],
                    'minCorrelation': alignment['minCorrelation'],
                    'silent5msWindowsInsideSignal': alignment['silent5msWindowsInsideSignal']})
report = {'root': str(root), 'results': results}
(root / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
