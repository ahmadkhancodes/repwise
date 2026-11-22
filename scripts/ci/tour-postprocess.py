#!/usr/bin/env python3
"""Fast-tour post-process (D-TOUR-FAST): trim, drop idle frames, speed up, keep payment holds at 1x, add music.

Usage: tour-postprocess.py RAW MARKS OUT_SILENT OUT_MUSIC MUSIC [TARGET_SECONDS]
Marks (epoch ms): rec_start, start, end, and any number of keep-start / keep-end pairs. Video between a
keep pair (paywall, test checkout, Payment complete, Subscription) is NEVER decimated or sped up.
"""
import subprocess, sys, os, tempfile

raw, marks_path, out_silent, out_music, music = sys.argv[1:6]
target = float(sys.argv[6]) if len(sys.argv) > 6 else 195.0


def run(*a):
    subprocess.run(a, check=True)


def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).decode())


# TOUR_TRIMMED=1: RAW is the tour.mp4 the current workflow already trimmed (start - 0.8 s .. end + 2.8 s).
TRIMMED = os.environ.get('TOUR_TRIMMED') == '1'


marks = {}
keeps_s, keeps_e = [], []
for line in open(marks_path):
    p = line.split()
    if len(p) != 2:
        continue
    n, v = p[0], int(p[1])
    if n == 'keep-start':
        keeps_s.append(v)
    elif n == 'keep-end':
        keeps_e.append(v)
    else:
        marks[n] = v
rec = marks.get('rec_start')
rel = (lambda v: (v - rec) / 1000.0) if rec else (lambda v: 0.0)
total = dur(raw)
if TRIMMED:
    rel = lambda v: (v - marks['start']) / 1000.0 + 0.8  # noqa: E731
    marks['end'] = marks.get('end', 0)
    rec = marks['start']
t0 = max(0.0, rel(marks['start']) - 0.8) if 'start' in marks and rec else 0.0
t1 = min(total, rel(marks['end']) + 2.0) if 'end' in marks and rec else total
pairs = [(max(t0, rel(s)), min(t1, rel(e))) for s, e in zip(keeps_s, keeps_e) if e > s]
segs, cur = [], t0
for a, b in pairs:
    if a > cur:
        segs.append(('fast', cur, a))
    if b > a:
        segs.append(('keep', a, b))
    cur = max(cur, b)
if t1 > cur:
    segs.append(('fast', cur, t1))
print('segments:', [(k, round(a, 1), round(b, 1)) for k, a, b in segs])

ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-an']
tmp = tempfile.mkdtemp()
files = []
for i, (kind, a, b) in enumerate(segs):
    f = os.path.join(tmp, f's{i}.mp4')
    vf = 'mpdecimate,setpts=N/FRAME_RATE/TB,fps=30' if kind == 'fast' else 'fps=30'
    run('ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-ss', str(a), '-to', str(b), '-i', raw, '-vf', vf, *ENC, f)
    files.append((kind, f, dur(f)))
fast = sum(d for k, _, d in files if k == 'fast')
keep = sum(d for k, _, d in files if k == 'keep')
factor = 1.0
if fast + keep > target + 15 and fast > 0:
    factor = max(1.0, fast / max(10.0, target - keep))
print(f'fast={fast:.1f}s keep={keep:.1f}s speed x{factor:.2f}')
parts = []
for i, (kind, f, d) in enumerate(files):
    if kind == 'fast' and factor > 1.01:
        g = os.path.join(tmp, f'f{i}.mp4')
        run('ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', f, '-vf', f'setpts=PTS/{factor},fps=30', *ENC, g)
        f = g
    parts.append(f)
lst = os.path.join(tmp, 'list.txt')
open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
run('ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', out_silent)
D = dur(out_silent)
print(f'final {D:.1f}s')
run('ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', out_silent, '-stream_loop', '-1', '-i', music,
    '-filter_complex', f'[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=1,afade=t=out:st={max(0, D - 2):.2f}:d=2,aresample=48000[a]',
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out_music)
