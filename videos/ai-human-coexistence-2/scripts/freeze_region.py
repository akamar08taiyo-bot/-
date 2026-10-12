# クリップの一部（座ったまま動かない人の頭など）を、決めたコマのまま止める
# 2026年10月 B1（喫茶店）：奥の席の女の人が、Veo の 4.5 秒から横顔になった（作品の約束：顔は見せない）。
#   体はほとんど動かないので、頭の所だけを、まだ窓の方を向いている 2 秒目（60 コマ目）のコマで止めた。まわりの壁の特徴点で追い、継ぎ目はポアソン合成で消す（paint_out.py）
#   体ごと動く人（身を乗り出す子どもなど）は、頭だけ止めると首でずれるので使わない（その時は切り抜きで画面の外へ）
# 使い方: python3 -I scripts/freeze_region.py <入力.mp4> <出力.mp4> --frame 60 --ellipse 1694,548,100,112 --feat 1350,150,1920,950
#   --frame：止める元のコマ番号（30fps）。--ellipse：止める所の楕円（中心 x,y と半径 rx,ry、画素）。--feat：動きを追う特徴点の範囲（paint_out.py と同じ）
# B1 の作り直し: python3 -I scripts/natural_clip.py scripts/natural_plan_v10.json B1 && cp public/clips/B1.mp4 work/raw/B1_face.mp4 &&
#   python3 -I scripts/freeze_region.py work/raw/B1_face.mp4 public/clips/B1.mp4 --frame 60 --ellipse 1694,548,100,112 --feat 1350,150,1920,950
import argparse, subprocess, tempfile
from pathlib import Path
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--frame', type=int, required=True); ap.add_argument('--ellipse', required=True); ap.add_argument('--feat', required=True)
ap.add_argument('--soft', type=float, default=6.0, help='楕円の縁のぼかし（画素）')
a = ap.parse_args()
root = Path(__file__).resolve().parent.parent
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.src, '-vf', f'select=eq(n\\,{a.frame})', '-vsync', '0', '-frames:v', '1',
                      '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True, check=True).stdout
plate = np.frombuffer(raw, np.uint8).reshape(1080, 1920, 3)
cx, cy, rx, ry = (int(v) for v in a.ellipse.split(','))
m = np.zeros((1080, 1920), np.uint8); cv2.ellipse(m, (cx, cy), (rx, ry), 0, 0, 360, 255, -1)
m = cv2.GaussianBlur(m, (0, 0), a.soft)
tmp = Path(tempfile.mkdtemp())
cv2.imwrite(str(tmp / 'plate.png'), plate); cv2.imwrite(str(tmp / 'mask.png'), m)
subprocess.run(['python3', '-I', str(root / 'scripts' / 'paint_out.py'), a.src, a.dst, str(tmp / 'plate.png'), str(tmp / 'mask.png'), '--feat', a.feat], check=True)
for name, ss in (('first', None), ('last', '-0.1')):  # 止めたあとの最初・最後のコマ（VShot が前後に出す）
    out = Path(a.dst).with_name(Path(a.dst).stem + f'_{name}.jpg')
    cmd = ['ffmpeg', '-v', 'error', '-y'] + (['-sseof', ss] if ss else []) + ['-i', a.dst, '-frames:v', '1', '-q:v', '2', str(out)]
    subprocess.run(cmd, check=True)
print('froze', a.ellipse, 'from frame', a.frame, '->', a.dst)
