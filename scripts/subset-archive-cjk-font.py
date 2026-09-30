"""Create the Archive CJK WOFF2 from Adobe's Source Han Sans SC VF TTF.

Requires fonttools[woff] and the original Version 2.005 TTF as input.
The generated file remains subject to the bundled SIL OFL license.
"""

import argparse
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont


UNICODES = "U+0000-33FF,U+4E00-9FFF,U+F900-FAFF,U+FE00-FEFF,U+FF00-FFEF"
OLD_FAMILY = "Source Han Sans SC VF"
NEW_FAMILY = "Auralis Archive CJK"
OLD_POSTSCRIPT = "SourceHanSansSCVF"
NEW_POSTSCRIPT = "AuralisArchiveCJK"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Original SourceHanSansSC-VF.ttf")
    parser.add_argument("output", type=Path, help="Generated AuralisArchiveCJK-Basic.woff2")
    args = parser.parse_args()

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
        if name.nameID == 0:  # Keep Adobe copyright and reserved-name notice intact.
            continue
        value = name.toUnicode()
        updated = value.replace(OLD_FAMILY, NEW_FAMILY).replace(OLD_POSTSCRIPT, NEW_POSTSCRIPT)
        if updated != value:
            name.string = updated.encode(name.getEncoding())
    font.save(args.output)


if __name__ == "__main__":
    main()
