#!/usr/bin/env python3
"""Cap every still stretch in a tour recording at CAP seconds, at 1x speed.

Maestro on iOS spends seconds between commands (hierarchy dumps), so the raw
recording has long static stretches that look "stuck" (owner QA, 23 Nov).
This keeps EVERY moving frame at real speed and only drops the frames of a
still stretch after its first CAP seconds. A dropped frame is identical to the
kept one, so the cut is invisible. No mpdecimate, no setpts speed-up.

usage: cap-freezes.py IN.mp4 OUT.mp4 [CAP=2.2] [MUSIC.mp3]
"""
import re
import subprocess
import sys
import tempfile

src, dst = sys.argv[1], sys.argv[2]
cap = float(sys.argv[3]) if len(sys.argv) > 3 else 2.2
music = sys.argv[4] if len(sys.argv) > 4 else None


def duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    ).stdout
    return float(out.strip())


D = duration(src)
log = subprocess.run(
    ["ffmpeg", "-nostdin", "-hide_banner", "-i", src, "-vf", f"freezedetect=n=-55dB:d={cap}",
     "-map", "0:v", "-f", "null", "-"],
    capture_output=True, text=True,
).stderr
starts = [float(x) for x in re.findall(r"freeze_start: ([0-9.]+)", log)]
ends = [float(x) for x in re.findall(r"freeze_end: ([0-9.]+)", log)]
if len(ends) < len(starts):
    ends.append(D)
# freezedetect reports a freeze only after `d` seconds, starting at its true start.
cuts = [(a + cap, b) for a, b in zip(starts, ends) if b - a > cap + 0.05]
removed = sum(b - a for a, b in cuts)
print(f"in {D:.1f}s, {len(cuts)} still stretches capped at {cap}s, out ~{D - removed:.1f}s")

keep = "+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in cuts) or "0"
vf = f"select='not({keep})',setpts=N/FRAME_RATE/TB"
with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False) as f:
    f.write(vf)
    script = f.name

silent = dst if not music else dst + ".silent.mp4"
subprocess.run(
    ["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", src, "-/vf", script, "-an",
     "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
     "-movflags", "+faststart", silent],
    check=True,
)
if music:
    d2 = duration(silent)
    fo = max(0.0, round(d2 - 3, 2))
    subprocess.run(
        ["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", silent, "-stream_loop", "-1", "-i", music,
         "-map", "0:v", "-map", "1:a", "-c:v", "copy",
         "-af", f"afade=t=in:d=1.5,afade=t=out:st={fo}:d=3,loudnorm=I=-16:TP=-1.5:LRA=11",
         "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", dst],
        check=True,
    )
print("done", dst)
