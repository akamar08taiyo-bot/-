# クリップの一部（座ったまま動かない人の頭、Veo が崩す背景など）を、決めたコマのまま止める
# 2026年10月 B1（喫茶店）：奥の席の女の人が、Veo の 4.5 秒から横顔になった（作品の約束：顔は見せない）。
#   体はほとんど動かないので、頭の所だけを、まだ窓の方を向いている 2 秒目（60 コマ目）のコマで止めた。まわりの壁の特徴点で追い、継ぎ目はポアソン合成で消す（paint_out.py）
#   体ごと動く人（身を乗り出す子どもなど）は、頭だけ止めると首でずれるので使わない（その時は切り抜きで画面の外へ）
# 2026年10月 止め絵を動かした時：B1s はモノレールが重なって3両に増え、B4p は奥のコースの車が人の乗ったカートに化けた。
#   動かしたい所（通りの人、男の手元）はそのままに、崩れる所（空の上、奥のコース）だけを最初のコマで止めた（--poly）
# 使い方: python3 -I scripts/freeze_region.py <入力.mp4> <出力.mp4> --frame 60 (--ellipse x,y,rx,ry | --poly "x,y;x,y;...")... [--feat x0,y0,x1,y1 | --still]
#   --frame：止める元のコマ番号（30fps）。--ellipse・--poly：止める所（画素。何度でも書ける）
#   --feat：カメラが動く時、動きを追う特徴点の範囲（止める所の外の、動かない建物など。paint_out.py と同じ）
#   --still：カメラが動かない時。追わずに、ぼかしたマスクでそのまま重ねる（速い）
# B1 の作り直し: python3 -I scripts/natural_clip.py scripts/natural_plan_v10.json B1 && cp public/clips/B1.mp4 work/raw/B1_face.mp4 &&
#   python3 -I scripts/freeze_region.py work/raw/B1_face.mp4 public/clips/B1.mp4 --frame 60 --ellipse 1694,548,100,112 --feat 1350,150,1920,950
import argparse, subprocess, tempfile
from pathlib import Path
import cv2
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--frame', type=int, required=True)
ap.add_argument('--ellipse', action='append', default=[]); ap.add_argument('--poly', action='append', default=[])
ap.add_argument('--feat'); ap.add_argument('--still', action='store_true')
ap.add_argument('--soft', type=float, default=6.0, help='止める所の縁のぼかし（画素）')
a = ap.parse_args()
assert a.ellipse or a.poly, '--ellipse か --poly が要る'
assert a.feat or a.still, '--feat（カメラが動く）か --still（動かない）が要る'
root = Path(__file__).resolve().parent.parent
W, H = 1920, 1080
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', a.src, '-vf', f'select=eq(n\\,{a.frame})', '-vsync', '0', '-frames:v', '1',
                      '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], capture_output=True, check=True).stdout
plate = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
m = np.zeros((H, W), np.uint8)
for e in a.ellipse:
    cx, cy, rx, ry = (int(v) for v in e.split(',')); cv2.ellipse(m, (cx, cy), (rx, ry), 0, 0, 360, 255, -1)
for p in a.poly:
    pts = np.array([[int(v) for v in q.split(',')] for q in p.split(';')], np.int32); cv2.fillPoly(m, [pts], 255)
m = cv2.GaussianBlur(m, (0, 0), a.soft)
if a.still:  # カメラが動かない：止めたコマを、ぼかしたマスクで重ねるだけ
    k = (m.astype(np.float32) / 255.0)[..., None]; pf = plate.astype(np.float32)
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', a.src, '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], stdout=subprocess.PIPE)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', '30', '-i', '-',
                            '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', a.dst], stdin=subprocess.PIPE)
    n = 0
    while True:
        buf = dec.stdout.read(W * H * 3)
        if len(buf) < W * H * 3: break
        fr = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.float32)
        enc.stdin.write(np.clip(fr * (1 - k) + pf * k, 0, 255).astype(np.uint8).tobytes()); n += 1
    enc.stdin.close(); enc.wait(); dec.wait()
else:
    tmp = Path(tempfile.mkdtemp())
    cv2.imwrite(str(tmp / 'plate.png'), plate); cv2.imwrite(str(tmp / 'mask.png'), m)
    subprocess.run(['python3', '-I', str(root / 'scripts' / 'paint_out.py'), a.src, a.dst, str(tmp / 'plate.png'), str(tmp / 'mask.png'), '--feat', a.feat], check=True)
for name, ss in (('first', None), ('last', '-0.1')):  # 止めたあとの最初・最後のコマ（VShot が前後に出す）
    out = Path(a.dst).with_name(Path(a.dst).stem + f'_{name}.jpg')
    cmd = ['ffmpeg', '-v', 'error', '-y'] + (['-sseof', ss] if ss else []) + ['-i', a.dst, '-frames:v', '1', '-q:v', '2', str(out)]
    subprocess.run(cmd, check=True)
print('froze', a.ellipse + a.poly, 'from frame', a.frame, '->', a.dst)
