"""Register generated pixels using reviewed hip landmarks, without redrawing."""
from pathlib import Path
import json
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
CELL = 128
SCALE = 1 / 12
# Reviewed waist/hip landmarks, not per-frame silhouette centers.
HIPS = [(653, 730), (660, 735), (655, 744), (706, 708),
        (650, 735), (659, 735), (658, 716), (713, 726)]
# Phase offsets calibrated against reviewed contact soles. Flight stays ungrounded.
BOB = [2, 1, 3, -2, 2, 2, 1, -2]
frames = []
report = []
(ROOT / 'frames').mkdir(exist_ok=True)
for index, ((hip_x, hip_y), bob) in enumerate(zip(HIPS, BOB), 1):
    source = Image.open(ROOT / 'sources' / f'run-{index:02}.png').convert('RGBA')
    scaled = source.resize((round(source.width * SCALE), round(source.height * SCALE)),
                           Image.Resampling.NEAREST)
    x = 60 - round(hip_x * SCALE)
    y = 65 + bob - round(hip_y * SCALE)
    bbox = scaled.getchannel('A').point(lambda p: 255 if p > 128 else 0).getbbox()
    visible = [bbox[0] + x, bbox[1] + y, bbox[2] + x, bbox[3] + y]
    assert visible[0] > 0 and visible[1] > 0
    assert visible[2] < CELL and visible[3] < CELL
    frame = Image.new('RGBA', (CELL, CELL))
    frame.alpha_composite(scaled, (x, y))
    frame.save(ROOT / 'frames' / f'run-{index:02}.png')
    frames.append(frame)
    report.append({'frame': index, 'source_hip': [hip_x, hip_y],
                   'registered_hip': [60, 65 + bob], 'visible_bounds': visible})

atlas = Image.new('RGBA', (CELL * 8, CELL))
contact = Image.new('RGBA', (CELL * 4 * 2, (CELL + 20) * 2 * 2), '#d6d1c7')
draw = ImageDraw.Draw(contact)
previews = []
for i, frame in enumerate(frames):
    atlas.alpha_composite(frame, (i * CELL, 0))
    left, top = (i % 4) * CELL * 2, (i // 4) * (CELL + 20) * 2
    draw.text((left + 12, top + 10), f'Frame {i+1:02}', fill='#303030')
    contact.alpha_composite(frame.resize((CELL * 2, CELL * 2), Image.Resampling.NEAREST),
                            (left, top + 30))
    preview = Image.new('RGBA', (CELL, CELL), '#d6d1c7')
    d = ImageDraw.Draw(preview)
    d.line((0, 110, CELL, 110), fill='#b5aea0')
    preview.alpha_composite(frame)
    previews.append(preview.convert('RGB').resize((CELL * 3, CELL * 3), Image.Resampling.NEAREST))
atlas.save(ROOT / 'run-atlas-draft.png')
contact.convert('RGB').save(ROOT / 'run-contact.png')
for name, duration in [('run-normal', 90), ('run-slow', 240)]:
    previews[0].save(ROOT / f'{name}.gif', save_all=True, append_images=previews[1:],
                     loop=0, duration=duration, disposal=2)
with Image.open(ROOT / 'run-normal.gif') as check:
    assert check.n_frames == 8
    assert check.info['loop'] == 0
(ROOT / 'registration.json').write_text(json.dumps({
    'cell': [CELL, CELL], 'scale': SCALE, 'frames': report,
    'duration_ms': 90, 'status': 'draft; structural checks passed; motion approval pending',
}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'frames': len(frames), 'clipping': False, 'scale': SCALE,
                  'bounds': [r['visible_bounds'] for r in report]}))
