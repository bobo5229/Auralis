"""Create the Auralis Mac Pixel WOFF2 font from Fusion Pixel 12px monospaced zh-Hans.

Requires fonttools[woff] and brotli.
The generated file remains subject to the bundled SIL OFL license.
"""

import argparse
from pathlib import Path
import shutil

from fontTools import subset
from fontTools.ttLib import TTFont

UNICODES = "U+0000-024F,U+2000-206F,U+3000-303F,U+4E00-9FFF,U+F900-FAFF,U+FF00-FFEF"
NEW_FAMILY = "Auralis Mac Pixel"
NEW_POSTSCRIPT = "AuralisMacPixel"
NEW_FULLNAME = "Auralis Mac Pixel Regular"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("demo/archive/assets/fusion-pixel/fusion-pixel-font-12px-monospaced-otf.woff2-v2026.09.25/fusion-pixel-12px-monospaced-zh_hans.otf.woff2"),
        help="Source fusion-pixel WOFF2 font",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("src/renderer/assets/fonts/archive-mac/AuralisMacPixel.woff2"),
        help="Output WOFF2 font file",
    )
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)

    subset.main(
        [
            str(args.source),
            f"--output-file={args.output}",
            "--flavor=woff2",
            f"--unicodes={UNICODES}",
            "--layout-features=*",
            "--notdef-glyph",
            "--notdef-outline",
        ]
    )

    font = TTFont(args.output)
    for name in font["name"].names:
        if name.nameID == 0:  # Keep copyright and reserved font name notices intact
            continue
        if name.nameID == 1:
            name.string = NEW_FAMILY.encode(name.getEncoding())
        elif name.nameID == 4:
            name.string = NEW_FULLNAME.encode(name.getEncoding())
        elif name.nameID == 6:
            name.string = NEW_POSTSCRIPT.encode(name.getEncoding())

    font.save(args.output)

    # Copy licenses
    source_dir = args.source.parent
    target_dir = args.output.parent

    ofl_src = source_dir / "OFL.txt"
    if ofl_src.exists():
        shutil.copy2(ofl_src, target_dir / "OFL.txt")

    licenses_src = source_dir / "LICENSES"
    if licenses_src.exists():
        licenses_dest = target_dir / "LICENSES"
        if licenses_dest.exists():
            shutil.rmtree(licenses_dest)
        shutil.copytree(licenses_src, licenses_dest)

    # Write derivation notice
    notice_path = target_dir / "NOTICE.md"
    notice_path.write_text(
        "# Auralis Mac Pixel\n\n"
        "Derived from Fusion Pixel Font (12px monospaced zh-Hans, v2026.09.25) by TakWolf.\n"
        "Subsetting and naming script: scripts/subset-archive-mac-font.py\n"
        f"Unicode ranges: {UNICODES}\n"
        "Licensed under SIL Open Font License 1.1. See OFL.txt and LICENSES/ for details.\n",
        encoding="utf-8",
    )
    print(f"Successfully generated {args.output} ({args.output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
