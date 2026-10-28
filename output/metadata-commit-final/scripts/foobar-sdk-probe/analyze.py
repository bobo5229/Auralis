"""Analyze SDK logs, unchanged M4A media, and captured PCM without dependencies."""
import argparse
import hashlib
import json
from pathlib import Path
import struct


def media(path):
    data = path.read_bytes()
    pos = 0
    digest = hashlib.sha256()
    boxes = []
    while pos < len(data):
        size, kind = struct.unpack_from(">I4s", data, pos)
        header = 8
        if size == 1:
            size = struct.unpack_from(">Q", data, pos + 8)[0]
            header = 16
        elif size == 0:
            size = len(data) - pos
        if size < header or pos + size > len(data):
            raise ValueError(f"invalid MP4 atom in {path}")
        boxes.append(kind.decode("latin1"))
        if kind == b"mdat":
            digest.update(data[pos + header:pos + size])
        pos += size
    if "mdat" not in boxes:
        raise ValueError("no mdat")
    return {"mdat_sha256": digest.hexdigest(), "top_level_atoms": boxes,
            "comment_retained": b"Auralis SDK isolated fixture" in data}


parser = argparse.ArgumentParser()
parser.add_argument("root", type=Path)
args = parser.parse_args()
root = args.root
events = [line.split("\t") for line in (root / "results/events.tsv").read_text().splitlines()]
formats = {e[1]: (int(e[2]), int(e[3])) for e in events if e[0] == "format"}
report = {"complete": any(e[0] == "DONE" for e in events),
          "errors": [e for e in events if e[0] == "ERROR"], "samples": []}
for name in (root / "samples.txt").read_text().splitlines():
    rate, channels = formats[name]
    reference = (root / "results" / (name + ".reference.f64")).read_bytes()
    cooperative = (root / "results" / (name + ".cooperative.f64")).read_bytes()
    control = (root / "results" / (name + ".control.f64")).read_bytes()
    edited = (root / "results" / (name + ".edited.f64")).read_bytes()
    common = min(len(control), len(edited))
    unit = 8 * channels
    originals = media(root / "fixtures" / name)
    written = [media(root / "work" / (prefix + name)) for prefix in ["cooperative-", "playing-"]]
    stops = [e for e in events if e[0] == "playback-stop" and e[1] == name]
    row = {"name": name, "rate": rate, "channels": channels,
           "cooperative_exact": reference == cooperative,
           "reference_frames": len(reference) // unit,
           "playback_control_frames": len(control) // unit,
           "playback_edited_frames": len(edited) // unit,
           "playback_common_prefix_exact": control[:common] == edited[:common],
           "playback_control_prefix_matches_reference": control == reference[:len(control)],
           "playback_edited_prefix_matches_reference": edited == reference[:len(edited)],
           "playback_tail_difference_ms": abs(len(control) - len(edited)) / unit / rate * 1000,
           "playback_stops": stops,
           "playback_completed": len(stops) == 2 and all(e[3] == "1" for e in stops)
               and stops[0][5] == "0" and stops[1][5] == "3" and common > rate * unit * 9,
           "media_preserved": all(x["mdat_sha256"] == originals["mdat_sha256"] for x in written),
           "comment_preserved": all(x["comment_retained"] for x in written),
           "original": originals}
    report["samples"].append(row)
report["write_success_count"] = sum(e[0] == "write-ok" for e in events)
report["playback_edit_events"] = sum(e[0] == "playback-edited-event" for e in events)
report["write_latency_ms"] = {
    mode: {"max_lock_wait": max(float(e[3]) for e in events if e[:2] == ["write-ok", mode]),
           "max_total": max(float(e[4]) for e in events if e[:2] == ["write-ok", mode])}
    for mode in ["cooperative", "playback"]}
output = root / "results/summary.json"
output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
if not report["complete"] or report["errors"] or report["write_success_count"] != 6 * len(formats):
    raise SystemExit("Incomplete or failed write suite")
if not all(s["cooperative_exact"] and s["playback_completed"] and s["playback_common_prefix_exact"] and
           s["playback_control_prefix_matches_reference"] and s["playback_edited_prefix_matches_reference"] and
           s["media_preserved"] and s["comment_preserved"] for s in report["samples"]):
    raise SystemExit("PCM or media preservation mismatch")
