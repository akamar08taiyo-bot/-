# 撮った JPEG（変わったときだけ届く）を、届いた時刻どおりの長さで mp4（H.264・30fps・1920x1080）にする
import json, os, subprocess, sys

out = sys.argv[1]
dest = sys.argv[2]
times = json.load(open(os.path.join(out, 'times.json')))
frames = sorted(f for f in os.listdir(os.path.join(out, 'frames')) if f.endswith('.jpg'))
n = min(len(times), len(frames))
lines = []
for i in range(n):
    d = (times[i + 1] - times[i]) if i + 1 < n else 3.0
    lines.append(f"file 'frames/{frames[i]}'")
    lines.append(f'duration {max(d, 0.001):.4f}')
lines.append(f"file 'frames/{frames[n - 1]}'")  # concat は最後の長さを使わないので、もう一度
open(os.path.join(out, 'list.txt'), 'w').write('\n'.join(lines) + '\n')
subprocess.run([
    'ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', os.path.join(out, 'list.txt'),
    '-vf', 'scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=white,fps=30,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-tune', 'stillimage', '-movflags', '+faststart', dest,
], check=True)
print('frames', n, 'length', round(times[n - 1] - times[0] + 3, 1), 's')
