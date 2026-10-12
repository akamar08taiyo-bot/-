# カットごとの映像（out/shots/<ID>.mp4）を timeline.json の順に 1.2 秒のクロスフェードでつなぎ、
# 最初と最後をフェード、フィルムの質感（周辺減光・黒の持ち上げ・粒子）をかけて書き出し、2つの音を重ねる
# 使い方: python3 -I scripts/assemble.py [--crf 20] [--maxrate 12M]
import argparse, json, subprocess
from pathlib import Path
root = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument('--crf', default='20'); ap.add_argument('--maxrate', default='12M'); ap.add_argument('--preset', default='slow')
ap.add_argument('--preview', action='store_true', help='スマホ確認用の軽い 720p 版も作る')
a = ap.parse_args()
T = json.loads((root / 'src' / 'timeline.json').read_text(encoding='utf-8'))
XF = T['crossfade']; shots = T['shots']
starts = []; s = 0.0
for sh in shots:
    starts.append(s); s += sh['dur'] - XF
total = starts[-1] + shots[-1]['dur']
inputs = []
for sh in shots:
    p = root / 'out' / 'shots' / f"{sh['id']}.mp4"
    assert p.exists(), f'missing {p}'
    inputs += ['-i', str(p)]
look = ("vignette=angle=0.36:mode=forward,lutrgb=r='val*0.9934+1.7':g='val*0.9948+1.3':b='val*0.99+2.6',"
        "noise=c0s=9:c0f=t+u:c1s=4:c1f=t+u:c2s=4:c2f=t+u")
f = []
for i in range(len(shots)):
    f.append(f'[{i}:v]settb=AVTB,fps=30,format=yuv420p,setsar=1[s{i}]')
prev = 's0'
for i in range(1, len(shots)):
    f.append(f'[{prev}][s{i}]xfade=transition=fade:duration={XF}:offset={starts[i]:.4f}[x{i}]')
    prev = f'x{i}'
fin = T.get('fadeIn', 2.5)  # 冒頭のつかみがある作品は短く（最初の一瞬から見せる）
f.append(f'[{prev}]fade=t=in:st=0:d={fin},fade=t=out:st={total - 2.5:.4f}:d=2.5,{look}[v]')
video = root / 'out' / 'video_look.mp4'
cmd = ['ffmpeg', '-v', 'error', '-stats', '-y', *inputs, '-filter_complex', ';'.join(f), '-map', '[v]', '-t', f'{total:.4f}',
       '-c:v', 'libx264', '-preset', a.preset, '-crf', a.crf, '-maxrate', a.maxrate, '-bufsize', '24M', '-pix_fmt', 'yuv420p', '-r', '30', '-g', '60',
       '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-an', str(video)]
subprocess.run(cmd, check=True)
for v in ('asmr', 'theme'):
    out = root / 'out' / f'ai_human_coexistence_{v}.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-i', str(root / 'audio' / 'out' / f'mix_{v}.wav'), '-map', '0:v', '-map', '1:a',
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', str(out)], check=True)
    print(out.name, subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'csv=p=0', str(out)], capture_output=True, text=True).stdout.strip())
if a.preview:
    for v in ('theme', 'asmr'):
        src = root / 'out' / f'ai_human_coexistence_{v}.mp4'; dst = root / 'out' / f'preview_{v}_720p.mp4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '25',
                        '-maxrate', '3M', '-bufsize', '6M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', str(dst)], check=True)
        print(dst.name, subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'csv=p=0', str(dst)], capture_output=True, text=True).stdout.strip())
print('timeline total', round(total, 2), 's')
