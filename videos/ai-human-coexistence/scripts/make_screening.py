# 上映ページ（Artifact）用の配信ファイルを作る：1080p の HLS（分割 MP4、目次は .txt）＋音2種類＋ポスター＋公開の分け方
# 使い方: python3 -I scripts/make_screening.py [--poster-at 22.6] [--vbitrate 3800k]
#  入力：out/video_look.mp4（assemble.py が作る、音なし・質感つき）、audio/out/mix_theme.wav、audio/out/mix_asmr.wav
#  出力：work/screen/ 以下（poster.jpg、hls/master.txt、hls/{v,a_theme,a_asmr}/index.txt・init.mp4・*_NNN.mp4）
#        work/screen/batches/batch_N.json（Artifact の publish に files として渡す一覧。root は work/screen）
# 背景：Artifact が配信できるのは .mp4 .txt .json .jpg などに限られ、.m3u8 や .ts は拒否される。
#       そこで HLS の分割を fMP4（拡張子 .mp4）、目次を .txt にして、ページ側は hls.js で再生する（site/screening.html）。
#       1回の公開は 64MB・255ファイルまで、1ファイル 15MB まで、1版で合計 256MB まで。
import argparse, json, shutil, subprocess
from pathlib import Path
root = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument('--poster-at', type=float, default=22.6); ap.add_argument('--vbitrate', default='3800k')
a = ap.parse_args()
scr = root / 'work' / 'screen'; hls = scr / 'hls'
shutil.rmtree(scr, ignore_errors=True)
for d in ('v', 'a_theme', 'a_asmr'):
    (hls / d).mkdir(parents=True, exist_ok=True)
(scr / 'batches').mkdir(parents=True, exist_ok=True)
def run(cmd): subprocess.run(cmd, check=True)
src = root / 'out' / 'video_look.mp4'
# 映像：2秒ごとにキーフレーム、10秒ごとに分割。1080p・平均 3.8Mbps 前後（全体が 256MB に収まる）
run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-an', '-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-level', '4.0',
     '-b:v', a.vbitrate, '-maxrate', '5000k', '-bufsize', '10000k', '-pix_fmt', 'yuv420p', '-force_key_frames', 'expr:gte(t,n_forced*2)', '-sc_threshold', '0',
     '-f', 'hls', '-hls_segment_type', 'fmp4', '-hls_time', '10', '-hls_playlist_type', 'vod', '-hls_fmp4_init_filename', 'init.mp4',
     '-hls_segment_filename', str(hls / 'v' / 'v_%03d.mp4'), str(hls / 'v' / 'index.m3u8')])
for v in ('theme', 'asmr'):
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(root / 'audio' / 'out' / f'mix_{v}.wav'), '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
         '-f', 'hls', '-hls_segment_type', 'fmp4', '-hls_time', '10', '-hls_playlist_type', 'vod', '-hls_fmp4_init_filename', 'init.mp4',
         '-hls_segment_filename', str(hls / f'a_{v}' / 'a_%03d.mp4'), str(hls / f'a_{v}' / 'index.m3u8')])
for d in ('v', 'a_theme', 'a_asmr'):
    m3u = hls / d / 'index.m3u8'; (hls / d / 'index.txt').write_text(m3u.read_text()); m3u.unlink()
(hls / 'master.txt').write_text('\n'.join([
    '#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="テーマ曲入り",LANGUAGE="ja",DEFAULT=YES,AUTOSELECT=YES,CHANNELS="2",URI="a_theme/index.txt"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="環境音のみ",LANGUAGE="ja",DEFAULT=NO,AUTOSELECT=YES,CHANNELS="2",URI="a_asmr/index.txt"',
    '#EXT-X-STREAM-INF:BANDWIDTH=5300000,AVERAGE-BANDWIDTH=3900000,RESOLUTION=1920x1080,FRAME-RATE=30.000,CODECS="avc1.640028,mp4a.40.2",AUDIO="aud"',
    'v/index.txt', '']))
run(['ffmpeg', '-v', 'error', '-y', '-ss', str(a.poster_at), '-i', str(src), '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '4', str(scr / 'poster.jpg')])
# 公開の分け方（1回 58MB・250ファイルまで）。最初の回にページの必須ファイル（目次・init・音声）を入れる
first = ['poster.jpg', 'hls/master.txt'] + [f'hls/{d}/{n}' for d in ('v', 'a_theme', 'a_asmr') for n in ('index.txt', 'init.mp4')]
segs = [str(p.relative_to(scr)) for d in ('a_theme', 'a_asmr', 'v') for p in sorted((hls / d).glob('*_[0-9][0-9][0-9].mp4'))]
batches, cur, size = [], list(first), sum((scr / f).stat().st_size for f in first)
for s in segs:
    n = (scr / s).stat().st_size
    if size + n > 58 * 1048576 or len(cur) >= 250:
        batches.append(cur); cur, size = [], 0
    cur.append(s); size += n
batches.append(cur)
total = 0
for i, b in enumerate(batches, 1):
    (scr / 'batches' / f'batch_{i}.json').write_text(json.dumps([{'path': f} for f in b], ensure_ascii=False))
    mb = sum((scr / f).stat().st_size for f in b) / 1048576; total += mb
    print(f'batch_{i}: {len(b)} files, {mb:.1f} MiB')
print(f'total {total:.1f} MiB（256MB 以内なら1版に収まる）')
