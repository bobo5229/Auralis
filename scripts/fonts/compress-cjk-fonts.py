"""Rebuild full-coverage WOFF2 containers: pip install fonttools[woff]."""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import compress


ROOT = Path(__file__).resolve().parents[2]
FONT_ROOT = ROOT / "src/renderer/assets/fonts"


def verify_tables(source: Path, target: Path) -> None:
    with TTFont(source, lazy=True) as original, TTFont(target, lazy=True) as packed:
        # FontTools drops DSIG: signatures over the original SFNT container no
        # longer apply to a WOFF2 container. Glyphs, layout and naming stay intact.
        assert set(original.reader.keys()) - {"DSIG"} == set(packed.reader.keys()), source
        for tag in packed.reader.keys():
            before = original.reader[tag]
            after = packed.reader[tag]
            if tag == "head":
                # WOFF2 updates the container checksum and lossless-transform flag.
                before = bytearray(before)
                after = bytearray(after)
                before[8:12] = after[8:12] = bytes(4)
                before[16] &= ~8
                after[16] &= ~8
            assert before == after, (source, tag)


for family in ("HarmonyOS_Sans_SC", "MiSans"):
    for source in sorted((FONT_ROOT / family).glob("*.ttf")):
        target = source.with_suffix(".woff2")
        # Disable glyph/metric transforms: retain original glyph and layout bytes.
        compress(source, target, transform_tables=set())
        verify_tables(source, target)
        print(f"{source.name}: {source.stat().st_size} -> {target.stat().st_size} bytes")
