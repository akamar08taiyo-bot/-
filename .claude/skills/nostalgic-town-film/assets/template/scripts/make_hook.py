# 冒頭のつかみ（数秒ずつの見せ場をつないだカット）を作る：timeline.json の "hook" を持つカットごとに、
# 本編のクリップ（public/clips/<元ID>.mp4、文字の焼き込み済み）から切り出して短いディゾルブでつなぎ、
# public/clips/<ID>.mp4 と最初・最後のコマを書き出し、timeline.json の clip（長さ）をそろえる
# 音は build_mix.py が同じ "hook" を読んで、区間ごとに元のカットの Veo の音・環境音・効果音を置く
# 使い方: python3 -I scripts/make_hook.py [ID ...]
#   "hook": {"xf": 0.5, "segs": [{"src": "C1", "ss": 0.2, "len": 3.8}, ...]}
#   ss：元のクリップの何秒目から、len：何秒使うか、xf：つなぎ目のディゾルブ（秒）、fadeOut：最後に黒へ落とす秒数（省略可）
import json, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
tl_path = root / 'src' / 'timeline.json'
T = json.loads(tl_path.read_text(encoding='utf-8'))
FPS = T['fps']
want = set(sys.argv[1:])


def hook_len(h):
    return sum(s['len'] for s in h['segs']) - h['xf'] * (len(h['segs']) - 1)


changed = False
for sh in T['shots']:
    h = sh.get('hook')
    if not h or (want and sh['id'] not in want):
        continue
    clips = root / 'public' / 'clips'
    inputs, f = [], []
    for i, s in enumerate(h['segs']):
        src = clips / f"{s['src']}.mp4"
        assert src.exists(), f'missing {src}'
        inputs += ['-ss', f"{s['ss']:.3f}", '-t', f"{s['len'] + 0.1:.3f}", '-i', str(src)]
        f.append(f"[{i}:v]settb=AVTB,fps={FPS},format=yuv420p,setsar=1,trim=duration={s['len']:.3f},setpts=PTS-STARTPTS[s{i}]")
    prev, off = 's0', 0.0
    for i in range(1, len(h['segs'])):
        off += h['segs'][i - 1]['len'] - h['xf']
        f.append(f"[{prev}][s{i}]xfade=transition=fade:duration={h['xf']}:offset={off:.4f}[x{i}]")
        prev = f'x{i}'
    L = hook_len(h)
    if h.get('fadeOut'):  # 最後を黒へ（VShot に veil の無い作品向け。字幕は Remotion が上に重ねるので、黒の上に残る）
        f.append(f"[{prev}]fade=t=out:st={L - h['fadeOut']:.4f}:d={h['fadeOut']}[fo]"); prev = 'fo'
    out = clips / f"{sh['id']}.mp4"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(f), '-map', f'[{prev}]', '-t', f'{L:.4f}', '-an',
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-movflags', '+faststart', str(out)], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(out), '-frames:v', '1', '-q:v', '2', str(clips / f"{sh['id']}_first.jpg")], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-sseof', '-0.1', '-i', str(out), '-frames:v', '1', '-q:v', '2', str(clips / f"{sh['id']}_last.jpg")], check=True)
    real = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(out)], capture_output=True, text=True).stdout)
    clip = round(min(real, L), 2)
    if sh.get('clip') != clip:
        sh['clip'] = clip; changed = True
    starts, t = [], 0.0
    for s in h['segs']:
        starts.append(round(t, 2)); t += s['len'] - h['xf']
    print(sh['id'], 'hook', round(L, 2), 's; segments start at', dict(zip([s['src'] for s in h['segs']], starts)))
if changed:
    tl_path.write_text(json.dumps(T, ensure_ascii=False, indent=1), encoding='utf-8')  # sync_cliplen.py と同じ書き方
    print('timeline.json の clip を更新')
