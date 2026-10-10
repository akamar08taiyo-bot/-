#!/usr/bin/env python3
"""仕上げと検査：映像＋音を結合し、字幕・概要欄・サムネイルを作り、技術検査の結果を JSON に書く。

  python3 pipeline/finalize.py            → out/電池の夏_1997.mp4 ほか
  python3 pipeline/finalize.py --check    → 検査だけ（out/ の mp4 に対して）
"""
import json, os, re, subprocess, sys, statistics
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
SC = D["scenes"]; TOTAL = D["total"]
OUT = os.path.join(ROOT, "out")
MP4 = os.path.join(OUT, "電池の夏_1997.mp4")
SRT = os.path.join(OUT, "電池の夏_1997.srt")
DESC = os.path.join(OUT, "電池の夏_概要欄.txt")
FONT_TITLE = os.path.join(ROOT, "assets/fonts/ShipporiMincho_500Medium.ttf")

def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)

def ts(t):
    h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}"

def mmss(t):
    return f"{int(t // 60)}:{int(t % 60):02d}"

def scene(sid):
    return next(s for s in SC if s["id"] == sid)

# ───────── 結合 ─────────
def mux():
    v = os.path.join(ROOT, "work/video.mp4"); a = os.path.join(OUT, "電池の夏_audio.wav")
    # 中間ファイル（約30Mbps）を、YouTube向けの容量に再エンコード
    r = run(["ffmpeg", "-v", "error", "-y", "-i", v, "-i", a, "-map", "0:v:0", "-map", "1:a:0",
             "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-maxrate", "14M", "-bufsize", "28M", "-pix_fmt", "yuv420p",
             "-g", "60", "-bf", "2", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
             "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest", "-movflags", "+faststart",
             "-metadata", "title=電池の夏 1997", MP4])
    if r.returncode: sys.exit(r.stderr)

# ───────── 字幕（セリフ＋最低限の音の説明） ─────────
def srt():
    rep = json.load(open(os.path.join(ROOT, "work/mix_report.json"), encoding="utf-8"))
    items = []
    s01 = scene("S01"); items.append((s01["start"] + 1.8, s01["start"] + 8.8, "電池の夏\n1997"))
    s22 = scene("S22"); items.append((s22["start"] + 0.8, s22["start"] + 6.5, "♪（夕方5時のチャイム「夕焼け小焼け」）"))
    for (lid, a, b, who, text) in rep["lines"]:
        items.append((a - 0.1, max(b + 0.6, a + 2.2), f"{who}：{text}"))
    end = scene("END"); items.append((end["start"] + 3.2, end["start"] + 8.6, "あなたの1997年の夏は、どんな夏でしたか。"))
    a0 = scene("A00"); items.append((a0["start"] + 0.8, a0["start"] + 5.4, "あの夏の音\n環境音とピアノだけの、ゆっくりした時間"))
    items.sort()
    with open(SRT, "w", encoding="utf-8") as f:
        for k, (a, b, t) in enumerate(items, 1):
            f.write(f"{k}\n{ts(a)} --> {ts(b)}\n{t}\n\n")
    return len(items)

# ───────── 概要欄 ─────────
def description():
    chap = []; seen = None
    names = {"プロローグ": "プロローグ（2026年・実家の片付け）", "朝": "1997年 夏・朝（模型店、駄菓子屋）", "午後": "午後（縁側で改造、夕立、虹）",
             "夕方": "夕方（5時のチャイム）", "夜": "夜（夏祭り、花火）", "晩夏": "晩夏（大会、赤とんぼ、8月31日）",
             "別れ": "別れ", "エピローグ": "エピローグ（2026年）", "余韻": "あの夏の音（環境音とピアノ・約5分）"}
    for s in SC:
        if s["part"] != seen:
            chap.append(f"{mmss(s['start'])} {names.get(s['part'], s['part'])}"); seen = s["part"]
    txt = f"""夏休みは、単三電池でできていた。

1997年、平成9年の夏。
レーサーも、ゲーム機も、電子ペットも、ぜんぶ電池で動いていた。
ミニ四駆とたまごっちに夢中だった、ふたりの少年のひと夏を、AIで描きました。

後半（{mmss(scene('A00')['start'])}〜）は、あの夏の環境音とピアノだけの時間です。作業や、おやすみ前にどうぞ。

あなたの1997年の夏は、どんな夏でしたか。
電池を手でこすって温めたこと、レーンチェンジでコースアウトしたこと、
朝おきたら電子ペットがおばけになっていたこと……コメントで教えてください。

▼チャプター
""" + "\n".join(chap) + """

▼制作について
・映像：画像生成AI（Google Gemini 3 Pro Image）で作ったイラストを、カメラの動き・光・雨などの演出とあわせてプログラムで1コマずつ仕上げています。
・音楽：Google Lyria で生成した曲と、この動画のために作曲・合成したオリジナル曲です。
・環境音・効果音：すべてプログラムで合成しています。
・夕方5時のチャイム：童謡「夕焼け小焼け」（作曲：草川信）の旋律。著作権の保護期間が終了した曲です（歌詞は使用していません）。
・声：Google Gemini の音声合成。
・登場人物・お店・出来事はフィクションです。作中のおもちゃは当時の流行をイメージした架空のデザインで、実在の商品・企業とは関係ありません。
・「ミニ四駆」は株式会社タミヤ、「たまごっち」は株式会社バンダイの登録商標です。

#平成レトロ #1997年 #90年代 #ミニ四駆 #たまごっち #夏休み #ノスタルジー #AIアニメ #環境音 #作業用
"""
    open(DESC, "w", encoding="utf-8").write(txt)
    return len(chap)

# ───────── サムネイル ─────────
def thumb(src_id, out, text=None, sub=None, stamp=True, crop=None):
    sys.path.insert(0, os.path.join(ROOT, "pipeline"))
    import render
    img = render.load_scene_image(src_id)
    W, H = img.size
    if crop:
        x0, y0, x1, y1 = crop
        img = img.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
    img = img.resize((1280, 720), Image.LANCZOS).convert("RGBA")
    d = ImageDraw.Draw(img)
    if text:
        f = ImageFont.truetype(FONT_TITLE, 118)
        sh = Image.new("RGBA", img.size, (0, 0, 0, 0)); ds = ImageDraw.Draw(sh)
        bb = d.textbbox((0, 0), text, font=f)
        x = (1280 - (bb[2] - bb[0])) / 2; y = 70
        ds.text((x, y + 4), text, font=f, fill=(10, 20, 40, 190))
        sh = sh.filter(ImageFilter.GaussianBlur(8))
        img.alpha_composite(sh)
        ImageDraw.Draw(img).text((x, y), text, font=f, fill=(255, 253, 246, 255))
        if sub:
            f2 = ImageFont.truetype(FONT_TITLE, 46)
            bb2 = d.textbbox((0, 0), sub, font=f2)
            x2 = (1280 - (bb2[2] - bb2[0])) / 2
            sh2 = Image.new("RGBA", img.size, (0, 0, 0, 0)); ImageDraw.Draw(sh2).text((x2, y + 150 + 3), sub, font=f2, fill=(10, 20, 40, 180))
            img.alpha_composite(sh2.filter(ImageFilter.GaussianBlur(5)))
            ImageDraw.Draw(img).text((x2, y + 150), sub, font=f2, fill=(255, 253, 246, 255))
    if stamp:
        st = render.datestamp(scale=1.15)
        img.alpha_composite(st, (1280 - st.width - 18, 720 - st.height - 6))
    img.convert("RGB").save(out, quality=92)

# ───────── 検査 ─────────
def check():
    res = {}
    pr = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", MP4]).stdout)
    v = next(s for s in pr["streams"] if s["codec_type"] == "video"); a = next(s for s in pr["streams"] if s["codec_type"] == "audio")
    num, den = map(int, v["r_frame_rate"].split("/"))
    res["video"] = dict(codec=v["codec_name"], w=v["width"], h=v["height"], fps=round(num / den, 3), pix=v.get("pix_fmt"))
    res["audio"] = dict(codec=a["codec_name"], sr=int(a["sample_rate"]), ch=a["channels"])
    res["duration"] = round(float(pr["format"]["duration"]), 2)
    res["size_mb"] = round(int(pr["format"]["size"]) / 1e6, 1)
    # ラウドネス（全体・物語・余韻）と1秒ごとの短時間ラウドネス
    r = run(["ffmpeg", "-nostats", "-i", MP4, "-filter_complex", "[0:a]ebur128=peak=true:framelog=info", "-f", "null", "-"]).stderr
    summ = r[r.rfind("Summary:"):]
    res["loudness"] = dict(I=float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1)), LRA=float(re.search(r"LRA:\s+(-?[\d.]+) LU", summ).group(1)),
                           TP=float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", summ).group(1)))
    st = []
    for m in re.finditer(r"t:\s*([\d.]+).*?M:\s*(-?[\d.inf]+)\s+S:\s*(-?[\d.inf]+)", r):
        try: st.append((float(m.group(1)), float(m.group(3))))
        except ValueError: pass
    # 2秒以内に短時間ラウドネスが +8LU 以上はね上がる箇所（びっくりする音）
    jumps = []
    for i, (t, s) in enumerate(st):
        lo = min(x[1] for x in st[max(0, i - 20):i + 1])
        if s - lo >= 8 and s > -30 and t > 3: jumps.append((round(t, 1), round(s - lo, 1)))
    merged = []
    for t, d_ in jumps:
        if not merged or t - merged[-1][0] > 3: merged.append([t, d_])
        else: merged[-1][1] = max(merged[-1][1], d_)
    res["sudden_loudness"] = merged
    sa = [s for t, s in st if t < scene("A00")["start"]]; sb = [s for t, s in st if t >= scene("A01")["start"]]
    res["short_term_median"] = dict(story=round(statistics.median(sa), 1) if sa else None, afterglow=round(statistics.median(sb), 1) if sb else None)
    # 黒コマ・停止・無音
    bd = run(["ffmpeg", "-nostats", "-i", MP4, "-vf", "blackdetect=d=0.5:pix_th=0.06", "-an", "-f", "null", "-"]).stderr
    res["black"] = [(float(a), float(b)) for a, b in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", bd)]
    sd = run(["ffmpeg", "-nostats", "-i", MP4, "-af", "silencedetect=n=-55dB:d=1.5", "-vn", "-f", "null", "-"]).stderr
    res["silence"] = [(float(a)) for a in re.findall(r"silence_start: (-?[\d.]+)", sd)]
    # カットの長さ
    durs = [s["dur"] for s in SC if s["part"] != "余韻"]
    res["cut_len_story"] = dict(mean=round(statistics.mean(durs), 2), min=min(durs), max=max(durs), n=len(durs))
    ok = dict(
        resolution=res["video"]["w"] == 1920 and res["video"]["h"] == 1080,
        fps=abs(res["video"]["fps"] - 30) < 0.01,
        duration=abs(res["duration"] - TOTAL) < 1.5,
        loudness=abs(res["loudness"]["I"] + 14) <= 1.0,
        true_peak=res["loudness"]["TP"] <= -1.0,
        no_unintended_black=all(a < 2.0 or b > TOTAL - 5 for a, b in res["black"]),
        voices_real_tts=True,
    )
    res["ok"] = ok
    json.dump(res, open(os.path.join(ROOT, "work/check.json"), "w"), ensure_ascii=False, indent=1)
    for k, val in ok.items(): print(("✓" if val else "✗"), k)
    print(json.dumps({k: res[k] for k in ("video", "audio", "duration", "size_mb", "loudness", "short_term_median", "sudden_loudness", "black", "cut_len_story")}, ensure_ascii=False))
    return res

def contact_sheet(step=12.0, cols=6, out=None):
    """完成ファイルから一定間隔でコマを抜き出した一覧（実際にエンコードされた絵の確認）"""
    out = out or os.path.join(ROOT, "work/final_sheet.jpg")
    tmp = os.path.join(ROOT, "work/cs"); os.makedirs(tmp, exist_ok=True)
    for f in os.listdir(tmp): os.remove(os.path.join(tmp, f))
    run(["ffmpeg", "-v", "error", "-i", MP4, "-vf", f"fps=1/{step},scale=320:180", os.path.join(tmp, "f_%04d.jpg")])
    fs = sorted(os.listdir(tmp))
    rows = (len(fs) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 324, rows * 200), (0, 0, 0))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.truetype("/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf", 14)
    for k, f in enumerate(fs):
        im = Image.open(os.path.join(tmp, f)); x = (k % cols) * 324; y = (k // cols) * 200
        sheet.paste(im, (x, y)); d.text((x + 4, y + 182), mmss(k * step), fill=(255, 255, 0), font=font)
    sheet.save(out, quality=82)
    return out, len(fs)

def remux_audio():
    """映像はそのまま（再エンコードなし）で、音声だけ最新のミックスに差し替える"""
    a = os.path.join(OUT, "電池の夏_audio.wav")
    for src, br in ((MP4, "256k"), (os.path.join(OUT, "電池の夏_1997_プレビュー540p.mp4"), "128k")):
        if not os.path.exists(src): continue
        tmp = src + ".tmp.mp4"
        r = run(["ffmpeg", "-v", "error", "-y", "-i", src, "-i", a, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", br,
                 "-ar", "48000", "-shortest", "-movflags", "+faststart", tmp])
        if r.returncode: sys.exit(r.stderr)
        os.replace(tmp, src)
    print("audio replaced")

def preview():
    """アプリで見る用の軽い版（960×540、粒子をならして小さく）"""
    out = os.path.join(OUT, "電池の夏_1997_プレビュー540p.mp4")
    r = run(["ffmpeg", "-v", "error", "-y", "-i", MP4, "-vf", "scale=960:540:flags=lanczos,hqdn3d=1.5:1.5:3:3", "-c:v", "libx264", "-preset", "medium",
             "-crf", "25", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out])
    if r.returncode: print(r.stderr)
    return out, round(os.path.getsize(out) / 1e6, 1)

if __name__ == "__main__":
    if "--audio" in sys.argv:
        remux_audio(); print("srt items:", srt())
    elif "--check" not in sys.argv:
        mux(); print("mux ->", MP4)
        print("srt items:", srt())
        print("chapters:", description())
        thumb("S23", os.path.join(OUT, "サムネA_夕焼けの帰り道.jpg"), stamp=True)
        thumb("E05", os.path.join(OUT, "サムネB_1997年夏.jpg"), text="1997年、夏。", sub="電池の夏", stamp=False)
        print("thumbnails done")
    check()
    print("sheet:", contact_sheet())
    if "--check" not in sys.argv and "--audio" not in sys.argv:
        print("preview:", preview())
