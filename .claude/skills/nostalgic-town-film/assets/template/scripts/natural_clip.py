# Veo の元の動画から、決めた範囲を「元の速さ」（または少しだけゆっくり）で切り出して、本編のクリップにする
# 映像精査（2026年10月）で、2〜3.6倍の引き伸ばし（動き補間）が「ゆっくり動く違和感」と「ゆがみ・二重写り」の元だと分かったため
# 使い方: python3 -I scripts/natural_clip.py <計画.json> [ID ...]
#   計画: {"<ID>": {"use": [開始秒, 終わり秒], "speed": 1.0, "src"?: "B5_v2", "crop"?: [x, y, 幅]}, ...}   speed は 1.0＝等速（人・ロボット・手が動くカット）、1.0〜1.5（波・灯り・煙だけのカット）
# 出力: 画面に文字を焼き込むカット（timeline の ink に bake、memory、grade、shade があるもの）は work/raw/<ID>.mp4（このあと bake_ink.py）、
#       それ以外は public/clips/<ID>.mp4。どちらも最初と最後のコマの jpg を作る。音は Veo の元の音を同じ範囲・同じ速さで work/veoaudio/<ID>.wav に
#       （等速なら伸ばさない。ゆっくりにする時だけ rubberband で伸ばす）
# 前の版のクリップと音は work/v9/ にとっておく（同じ名前が既にあれば上書きしない）
import json, shutil, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
plan = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
want = set(sys.argv[2:])
T = json.loads((root / 'src' / 'timeline.json').read_text(encoding='utf-8'))
S = {s['id']: s for s in T['shots']}
keep = root / 'work' / 'v9'; keep.mkdir(parents=True, exist_ok=True)


def baked(sh):
    return any(k.get('bake') for k in sh.get('ink', [])) or sh.get('memory') or sh.get('grade') or sh.get('shade')


def save_old(p):
    if p.exists():
        dst = keep / p.parent.name / p.name; dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists(): shutil.copy2(p, dst)


for sid, pl in plan.items():
    if want and sid not in want: continue
    sh = S[sid]; a, b = pl['use']; k = float(pl.get('speed', 1.0))
    src = root / 'assets' / 'veo' / f"{pl.get('src', sid + '_v1')}.mp4"  # 作り直した Veo を使う時は "src": "B5_v2"
    dst = (root / 'work' / 'raw' if baked(sh) else root / 'public' / 'clips') / f'{sid}.mp4'
    dst.parent.mkdir(parents=True, exist_ok=True)
    for p in (root / 'public' / 'clips' / f'{sid}.mp4', root / 'work' / 'raw' / f'{sid}.mp4', root / 'work' / 'veoaudio' / f'{sid}.wav',
              root / 'public' / 'clips' / f'{sid}_first.jpg', root / 'public' / 'clips' / f'{sid}_last.jpg'):
        save_old(p)
    if k == 1.0:
        vf = 'setpts=PTS-STARTPTS,fps=30'  # 24fps を 30fps に（コマを足すだけで、作ったコマは入れない）
    else:  # 少しだけゆっくり：動き補間は弱い倍率のときだけ
        vf = f'setpts={k}*(PTS-STARTPTS),minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1'
    if pl.get('crop'):  # 顔などを外すための切り抜き [x, y, 幅]（1920x1080 の画素。高さは 16:9 で決まる）→ 1920x1080 に戻す
        cx, cy, cw = pl['crop']; vf = f'crop={cw}:{round(cw * 9 / 16)}:{cx}:{cy},scale=1920:1080:flags=lanczos,' + vf
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{a:.3f}', '-t', f'{b - a:.3f}', '-i', str(src), '-an', '-vf', vf, '-r', '30',
                    '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(dst)], check=True)
    pub = root / 'public' / 'clips'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(dst), '-frames:v', '1', '-q:v', '2', str(pub / f'{sid}_first.jpg')], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-sseof', '-0.1', '-i', str(dst), '-frames:v', '1', '-q:v', '2', str(pub / f'{sid}_last.jpg')], check=True)
    # 音：Veo の元の音（48kHz ステレオ）。等速ならそのまま
    wav = root / 'work' / 'veoaudio' / f'{sid}.wav'
    af = 'aresample=48000' if k == 1.0 else f'aresample=48000,rubberband=tempo={1 / k:.4f}:transients=crisp:detector=compound:phase=independent:window=standard:formant=preserved:pitchq=quality'
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{a:.3f}', '-t', f'{b - a:.3f}', '-i', str(src), '-vn', '-af', af, '-ac', '2', str(wav)])
    if r.returncode: print(sid, 'no audio track')
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(dst)], capture_output=True, text=True).stdout)
    print(sid, f'raw {a:.2f}-{b:.2f}s x{k} -> {dur:.2f}s', '(bake next)' if baked(sh) else '')
