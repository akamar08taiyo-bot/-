#!/usr/bin/env python3
"""仕上げ：音量を -14 LUFS（真のピーク -1.5 dBTP 以下）に合わせ、映像と重ね、字幕と概要欄を書き、検査する。

  python3 -I scripts/finish.py --ep honne02   → out/<回>.mp4, out/<回>.srt（概要欄は out/<回>_概要欄.txt に手で書く）

script.json に "silent": true の回（声も音もなく、音楽は投稿のときに YouTube で足す）は、映像だけを圧縮し直して
音のトラックなしで書き出す。YouTube の音源を足せるよう、60秒未満かも確かめる。
"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT, episode

EP = episode()
S = EP.script()
OUT = os.path.join(ROOT, 'out')
os.makedirs(OUT, exist_ok=True)
vid = S['id']
mix = os.path.join(EP.work, 'mix.wav')
silent = os.path.join(EP.work, 'video_silent.mp4')
final = os.path.join(OUT, f'{vid}.mp4')


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True)


def report(checks):
    ok = True
    for name, good, val in checks:
        print(('✓' if good else '✗'), name, val)
        ok &= good
    print('size', f"{os.path.getsize(final) / 1e6:.1f} MB", os.path.relpath(final, ROOT))
    sys.exit(0 if ok else 1)


def video_checks(probe, max_len=None):
    """縦横（script.json の format: vertical / horizontal）、フレームレート（fps、既定 30）と長さの範囲（len: [最短, 最長] 秒）を確かめる"""
    v = next(s for s in probe['streams'] if s['codec_type'] == 'video')
    fps = eval(v['r_frame_rate'])
    dur = float(probe['format']['duration'])
    w, h = (1920, 1080) if S.get('format') == 'horizontal' else (1080, 1920)
    lo, hi = S.get('len', [35, 60])
    hi = min(hi, max_len) if max_len else hi
    want = S.get('fps', 30)
    return v, [
        (f'解像度 {w}x{h}', v['width'] == w and v['height'] == h, f"{v['width']}x{v['height']}"),
        (f'{want}fps', abs(fps - want) < 0.01, f'{fps:.2f}'),
        (f'長さ {lo}〜{hi}秒', lo <= dur <= hi, f'{dur:.2f}s'),
    ]


if S.get('silent'):
    run(['ffmpeg', '-y', '-hide_banner', '-i', silent, '-map', '0:v', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation',
         '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', final])
    probe = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', final]).stdout)
    _, checks = video_checks(probe, max_len=59)
    checks.append(('音のトラックなし（音楽は YouTube で足す）', not any(s['codec_type'] == 'audio' for s in probe['streams']), '音なし'))
    report(checks)

T = EP.timeline()
if T.get('estimated'):
    sys.exit('timeline.json が文字数からの仮の時刻です。声を作って prep_audio.py を通してから仕上げてください')


# 1) 音量：loudnorm の2回通し（1回目で測り、2回目で合わせる）
TARGET = dict(I=-14.0, TP=-1.5, LRA=11)
r = run(['ffmpeg', '-hide_banner', '-i', mix, '-af',
         f"loudnorm=I={TARGET['I']}:TP={TARGET['TP']}:LRA={TARGET['LRA']}:print_format=json", '-f', 'null', '-'])
m = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
af = (f"loudnorm=I={TARGET['I']}:TP={TARGET['TP']}:LRA={TARGET['LRA']}:measured_I={m['input_i']}:"
      f"measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
      f"offset={m['target_offset']}:linear=true:print_format=json,aresample=48000")
# 2) 映像と重ねる（映像はイラスト向けの設定で圧縮し直す。crf 22 でアプリで送れる 25MB 前後、見た目はほぼ同じ）
run(['ffmpeg', '-y', '-hide_banner', '-i', silent, '-i', mix, '-af', af, '-map', '0:v', '-map', '1:a',
     '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '22', '-pix_fmt', 'yuv420p',
     '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-movflags', '+faststart', final])


# 3) 字幕（.srt）
def ts(t):
    ms = int(round(t * 1000))
    return f'{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}'


lines = {l['id']: l for l in S['lines']}
srt = []
for i, l in enumerate(T['lines']):
    nxt = T['lines'][i + 1]['start'] - 0.05 if i + 1 < len(T['lines']) else l['end'] + 0.3
    end = min(nxt, l['end'] + 0.6)
    text = re.sub(r'[{}*]', '', lines[l['id']].get('sub', lines[l['id']]['text']))
    srt.append(f"{i + 1}\n{ts(l['start'])} --> {ts(end)}\n{text}\n")
open(os.path.join(OUT, f'{vid}.srt'), 'w', encoding='utf-8').write('\n'.join(srt))

# 4) 検査
probe = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', final]).stdout)
v, checks = video_checks(probe)
a = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
eb = run(['ffmpeg', '-hide_banner', '-nostats', '-i', final, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr
I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', eb)[-1])
TPk = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', eb)[-1])
checks += [
    ('音量 -14 LUFS ±1', abs(I + 14) <= 1.0, f'{I:.1f} LUFS'),
    ('真のピーク ≤ -1.0 dBTP', TPk <= -1.0, f'{TPk:.1f} dBTP'),
    ('音声 AAC 48kHz ステレオ', a['codec_name'] == 'aac' and a['sample_rate'] == '48000' and a['channels'] == 2,
     f"{a['codec_name']} {a['sample_rate']} {a['channels']}ch"),
    ('音と映像の長さの差 < 0.1秒', abs(float(a['duration']) - float(v['duration'])) < 0.1,
     f"音 {float(a['duration']):.2f}s / 映像 {float(v['duration']):.2f}s"),
]
report(checks)
