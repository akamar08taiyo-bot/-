# public/clips/<ID>.mp4 の長さを調べ、15.9 秒と違うカットは timeline.json の "clip" に書く（頭や後ろを切った・倍率を変えたクリップ）
import json, subprocess
from pathlib import Path
root = Path(__file__).resolve().parent.parent
p = root / 'src' / 'timeline.json'
tl = json.loads(p.read_text())
for s in tl['shots']:
    f = root / 'public' / 'clips' / f"{s['id']}.mp4"
    if not f.exists():
        print(s['id'], 'no clip'); continue
    n = int(subprocess.run(['ffprobe', '-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', str(f)], capture_output=True, text=True).stdout.strip())
    sec = n / tl['fps']
    clip = round(sec - 0.05, 2)  # 最後のコマのぶん、少し短めに
    if abs(clip - tl['clipLen']) > 0.04:
        s['clip'] = clip
    else:
        s.pop('clip', None)
    print(s['id'], n, 'frames', s.get('clip', '(15.9)'), 'dur', s['dur'])
p.write_text(json.dumps(tl, ensure_ascii=False, indent=1))
