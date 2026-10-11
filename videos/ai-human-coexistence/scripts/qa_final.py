# 完成動画の点検：形式・長さ、黒コマ・止まったコマの検出、8秒ごとのコマの一覧画像
# 使い方: python3 -I scripts/qa_final.py <動画.mp4> <出力フォルダ>
import json, subprocess, sys
from pathlib import Path
import cv2
import numpy as np
src, outd = sys.argv[1], Path(sys.argv[2]); outd.mkdir(parents=True, exist_ok=True)
pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels:format=duration,size,bit_rate',
                                '-of', 'json', src], capture_output=True, text=True).stdout)
print(json.dumps(pr, ensure_ascii=False))
log = subprocess.run(['ffmpeg', '-v', 'info', '-i', src, '-vf', 'blackdetect=d=0.3:pix_th=0.06,freezedetect=n=0.002:d=1.5', '-an', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr
print('\n'.join(l for l in log.splitlines() if 'black_start' in l or 'freeze_start' in l or 'freeze_duration' in l) or 'no black/freeze segments')
cap = cv2.VideoCapture(src); fps = cap.get(cv2.CAP_PROP_FPS); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
times = list(np.arange(4.0, n / fps, 8.0))
tiles = []
for t in times:
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(t * fps)); ok, fr = cap.read()
    if not ok: continue
    fr = cv2.resize(fr, (480, 270)); cv2.putText(fr, f'{int(t // 60)}:{t % 60:04.1f}', (8, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    tiles.append(fr)
per = 16
for k in range(0, len(tiles), per):
    group = tiles[k:k + per]
    while len(group) % 4: group.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(group[i:i + 4]) for i in range(0, len(group), 4)])
    cv2.imwrite(str(outd / f'sheet_{k // per + 1}.jpg'), sheet, [cv2.IMWRITE_JPEG_QUALITY, 82])
print('sheets', (len(tiles) + per - 1) // per)
