"""Extract separated source poses with shared scale; build draft previews."""
from pathlib import Path
import json
import shutil
from PIL import Image

ROOT = Path(__file__).resolve().parent
SOURCE = Path(r'C:\Users\BoBo\.codex\generated_images\01a11800-6661-7b30-ac73-5585ee4439c1')
FILES = {
    'base': 'exec-771033e6-115c-4d3e-9a4b-e6d786e09bc4.png',
    'run': 'exec-3773cf40-39db-4eb6-b500-7c0a1bea3f2e.png',
    'idle': 'exec-f2e5850d-eae1-4de1-a12e-c080a5251757.png',
}
for name, source in FILES.items():
    shutil.copy2(SOURCE / source, ROOT / f'{name}-source.png')

frames_by_state = {}
report = {}
for state, expected in [('run', 8), ('idle', 6)]:
    im = Image.open(ROOT / f'{state}-source.png').convert('RGBA')
    alpha = im.getchannel('A')
    columns = [sum(alpha.getpixel((x, y)) > 128 for y in range(im.height)) > 5
               for x in range(im.width)]
    spans = []
    start = None
    for x, occupied in enumerate(columns + [False]):
        if occupied and start is None:
            start = x
        elif not occupied and start is not None:
            if x - start > 20:
                spans.append((start, x))
            start = None
    if len(spans) != expected:
        raise ValueError(f'{state}: expected {expected} poses, found {spans}')
    bounds = []
    for left, right in spans:
        mask = alpha.crop((left, 0, right, im.height)).point(lambda p: 255 if p > 128 else 0)
        box = mask.getbbox()
        bounds.append((left, box[1], right, box[3]))
    # One transform per source row, never independently resize individual poses.
    row_top = min(box[1] for box in bounds)
    row_bottom = max(box[3] for box in bounds)
    scale = 200 / (row_bottom - row_top)
    frames = []
    for index, (left, top, right, bottom) in enumerate(bounds):
        slot = Image.new('RGBA', (160, 241))
        pose = im.crop((max(0, left - 2), row_top, min(im.width, right + 2), row_bottom))
        pose = pose.resize((round(pose.width * scale), 200), Image.Resampling.NEAREST)
        slot.alpha_composite(pose, ((160 - pose.width) // 2, 25))
        slot.save(ROOT / f'{state}-{index:02d}.png')
        frames.append(slot)
    frames_by_state[state] = frames
    report[state] = {'count': len(frames), 'source_bounds': bounds,
                     'duration_ms': 90 if state == 'run' else 240}

atlas = Image.new('RGBA', (1280, 482))
for row, state in enumerate(['run', 'idle']):
    for index, frame in enumerate(frames_by_state[state]):
        atlas.alpha_composite(frame, (index * 160, row * 241))
atlas.save(ROOT / 'spritesheet-draft.png')
for state, frames in frames_by_state.items():
    previews = []
    for frame in frames:
        bg = Image.new('RGBA', frame.size, '#dad7d0')
        bg.alpha_composite(frame)
        previews.append(bg.convert('RGB'))
    previews[0].save(ROOT / f'{state}-preview.gif', save_all=True,
                     append_images=previews[1:], loop=0,
                     duration=report[state]['duration_ms'], disposal=2)
(ROOT / 'animation-draft.json').write_text(json.dumps({
    'status': 'draft, motion approval pending', 'cell': [160, 241],
    'rows': ['run', 'idle'], 'states': report,
}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report))
