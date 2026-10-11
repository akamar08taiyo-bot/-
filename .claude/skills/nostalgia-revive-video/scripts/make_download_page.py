#!/usr/bin/env python3
"""クラウド環境で作った大きな動画を、ユーザーのスマホやPCへ渡すための「保存ページ」（Artifact）を作る。

アプリで送れるのは30MB程度まで、Git は1ファイル100MBまで、Artifact は1ファイル15MB・1版256MBまで。そこで：
  1) 動画を HEVC（H.265）1080p・約2.6Mbps に圧縮して 245MB 以下にする
     （12分の動画で約247MB。元の1.2GBと並べても、フィルムの粒が少しなめらかになる程度。YouTube はさらに圧縮して配信する）
  2) 14MB ごとに parts/pNN.mp4 に分ける（Artifact は .bin を配れないので .mp4 の名前にする。中身は動画の途中のバイト列）
  3) ボタンを押すとブラウザの中で1本の mp4 につなぎ直し、downloads 機能で保存の確認を出すページを作る
     （iPhone の Claude アプリでは共有メニューが出て「ビデオを保存」「"ファイル"に保存」を選べる。Android アプリは200MBまで）

  PROJ=作品 python3 make_download_page.py out/作品.mp4 --name "電池の夏 ― 1997" --title "電池の夏 ダウンロード" \\
      --channel "記憶の路地裏" --thumb out/サムネ.jpg --out <スクラッチパッド>/dl
      [--bitrate 2600]（映像のkbps。長い動画は 245MB に収まるよう自動で下げる） [--no-compress]（すでに小さいとき）
  → <out>/index.html・thumb.jpg・parts/pNN.mp4 と、公開の分け方を表示する

Artifact への公開（Claude が Artifact ツールで行う）：
  1回目：file_path=<out>/index.html、icon="download"、capabilities={"downloads": true}、
         files={"thumb.jpg": …, "parts/p00.mp4": …, …最初の4個}（1回の公開は64MBまで）
  2回目以降：同じ file_path で、files に次の4個ずつ（capabilities は省略すると引き継がれる）
  最後に action:"list", scope:"files" で全部そろったかを確かめ、1個を action:"read" で取り出して sha256 を比べる。
公開前の確かめ：ローカルで http.server とヘッドレスの Chromium（Playwright）を使い、window.claude.use を
置き換えて「保存」に渡る Blob の大きさが元のファイルと同じか、400px 幅で横にはみ出さないかを見る。
"""
import argparse, json, os, shutil, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("PROJ") or os.getcwd()
TEMPLATE = os.path.join(HERE, "..", "assets", "download_page_template.html")
LIMIT = 245_000_000      # 1版256MB（ページとサムネの分を残す）
CHUNK = 14_000_000       # 1ファイル15MBまで
PER_PUBLISH = 4          # 1回の公開64MBまで

ap = argparse.ArgumentParser()
ap.add_argument("video"); ap.add_argument("--name", required=True); ap.add_argument("--title", required=True)
ap.add_argument("--channel", default=""); ap.add_argument("--thumb", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--bitrate", type=int, default=2600); ap.add_argument("--no-compress", action="store_true")
a = ap.parse_args()
src = a.video if os.path.isabs(a.video) else os.path.join(ROOT, a.video)
thumb = a.thumb if os.path.isabs(a.thumb) else os.path.join(ROOT, a.thumb)
os.makedirs(a.out, exist_ok=True)

def probe(p):
    j = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_type,width,height,r_frame_rate",
                                   "-of", "json", p], capture_output=True, text=True).stdout)
    v = next(s for s in j["streams"] if s.get("codec_type") == "video")
    n, d = map(int, v["r_frame_rate"].split("/"))
    return float(j["format"]["duration"]), int(j["format"]["size"]), v["width"], v["height"], round(n / d)

dur, orig_size, w, h, fps = probe(src)
base = os.path.splitext(os.path.basename(src))[0]
filename = (base if base.endswith("_YouTube用") else base + "_YouTube用") + ".mp4"
small = os.path.join(a.out, filename)
if a.no_compress:
    shutil.copy(src, small)
else:
    vk = min(a.bitrate, int((LIMIT * 8 * 0.96 / dur - 160_000) / 1000))
    if vk < 1500:
        sys.exit(f"長すぎます（{dur/60:.0f}分）。1つのページ（256MBまで）に入れると映像が {vk}kbps になり荒れます。720p にするか、動画を分けてください。")
    print(f"圧縮：HEVC {vk}kbps（{dur:.0f}秒）…")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-c:v", "libx265", "-preset", "fast", "-b:v", f"{vk}k",
                    "-x265-params", "log-level=error", "-tag:v", "hvc1", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", small], check=True)
size = os.path.getsize(small)
cname = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", small],
                       capture_output=True, text=True).stdout.strip()
codec = {"hevc": "H.265", "h264": "H.264", "av1": "AV1", "vp9": "VP9"}.get(cname, cname)
if size > LIMIT + 8_000_000:
    sys.exit(f"{size/1e6:.0f}MB は1つのページに入りません。--bitrate を下げてください。")
if subprocess.run(["ffmpeg", "-v", "error", "-i", small, "-f", "null", "-"], capture_output=True, text=True).stderr.strip():
    sys.exit("圧縮した動画にエラーがあります（全コマの読み込みで失敗）。")

pd = os.path.join(a.out, "parts"); shutil.rmtree(pd, ignore_errors=True); os.makedirs(pd)
parts = []
with open(small, "rb") as f:
    k = 0
    while True:
        b = f.read(CHUNK)
        if not b: break
        name = f"parts/p{k:02d}.mp4"
        open(os.path.join(a.out, name), "wb").write(b); parts.append({"path": name, "size": len(b)}); k += 1
assert sum(p["size"] for p in parts) == size
shutil.copy(thumb, os.path.join(a.out, "thumb.jpg"))

m, s_ = divmod(round(dur), 60)
fill = {"__TITLE__": a.title, "__NAME__": a.name, "__EYEBROW__": (a.channel + "　" if a.channel else "") + "動画の保存",
        "__FILENAME__": filename, "__SIZE_MB__": str(round(size / 1e6)), "__RES__": f"{w}×{h}・{fps}コマ/秒（{codec}）",
        "__DURATION__": f"{m}分{s_:02d}秒", "__ORIG__": (f"{orig_size/1e9:.1f}GB" if orig_size >= 1e9 else f"{orig_size/1e6:.0f}MB"),
        "__PARTS__": json.dumps(parts)}
html = open(TEMPLATE, encoding="utf-8").read()
for k_, v in fill.items(): html = html.replace(k_, v)
assert "__" not in html.replace("__saved", ""), "テンプレートに埋めていない所があります"
open(os.path.join(a.out, "index.html"), "w", encoding="utf-8").write(html)

print(f"{filename}: {size/1e6:.1f}MB、{len(parts)}個に分割 → {a.out}")
batches = [parts[i:i + PER_PUBLISH] for i in range(0, len(parts), PER_PUBLISH)]
for i, bt in enumerate(batches):
    print(f"公開{i + 1}回目：" + ("index.html＋thumb.jpg＋" if i == 0 else "") + "、".join(p["path"] for p in bt))
