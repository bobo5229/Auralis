"""Create synthetic M4A fixtures. Never accepts existing music files."""
import argparse
import pathlib
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("root", type=pathlib.Path)
parser.add_argument("ffmpeg", type=pathlib.Path)
args = parser.parse_args()
args.root.mkdir(parents=True, exist_ok=True)
(args.root / "ISOLATED_SYNTHETIC_ONLY").touch()
fixtures = args.root / "fixtures"
fixtures.mkdir(exist_ok=True)
names = []
for codec, rate, channels in [("aac", 48000, 2), ("aac", 44100, 1),
                              ("alac", 48000, 2), ("alac", 96000, 2)]:
    for faststart in [False, True]:
        name = f"{codec}-{rate}-{channels}-{'front' if faststart else 'back'}.m4a"
        names.append(name)
        # A varying signal makes skipped/repeated samples distinguishable.
        expr = "0.11*sin(2*PI*(173*t+27*t*t))+0.07*sin(2*PI*(997*t+13*t*t))"
        if channels == 2:
            expr += "|0.09*sin(2*PI*(281*t+19*t*t))+0.06*sin(2*PI*(1597*t+7*t*t))"
        cmd = [str(args.ffmpeg), "-hide_banner", "-loglevel", "error", "-y",
               "-f", "lavfi", "-i", f"aevalsrc={expr}:s={rate}:d=10",
               "-c:a", codec, "-metadata", "title=synthetic-original",
               "-metadata", "comment=Auralis SDK isolated fixture"]
        if codec == "aac":
            cmd += ["-b:a", "192k"]
        if faststart:
            cmd += ["-movflags", "+faststart"]
        subprocess.run(cmd + [str(fixtures / name)], check=True)
(args.root / "samples.txt").write_text("\n".join(names) + "\n", encoding="utf-8")
print("Generated", len(names), "synthetic M4A files in", fixtures)
