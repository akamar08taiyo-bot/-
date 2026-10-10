#!/usr/bin/env python3
"""仕上げと検査：映像＋音を結合し、字幕・概要欄・サムネイルを作り、技術検査の結果を JSON に書く。

  PROJ=作品フォルダ python3 finalize.py           → out/<out_name>.mp4, .srt, _概要欄.txt, サムネ, 540pプレビュー, work/check.json
  PROJ=作品フォルダ python3 finalize.py --check   → 検査だけ（out/ の mp4 に対して）
  PROJ=作品フォルダ python3 finalize.py --audio   → 音だけ差し替え（映像は再エンコードしない）＋字幕を作り直す
  PROJ=作品フォルダ python3 finalize.py --small   → アプリで送れる大きさ（既定28MB以下）の360pプレビュー（2パス）

scenes.json の meta で使うもの：out_name, title, subtitle, end_question, afterglow_title, afterglow_sub,
afterglow_part, thumbs, chapters（part 名 → 概要欄の章の名前）, sfx_captions（効果音名 → 字幕。例 chime5 → ♪チャイム）
概要欄は description_template.txt（{chapters} と {afterglow_start} を差し込む）。
"""
import json, os, re, subprocess, sys, statistics
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
# 作品フォルダ（scenes.json・assets・out・work がある所）。環境変数 PROJ（なければ今のフォルダ）
ROOT = os.environ.get("PROJ") or os.getcwd()
D = json.load(open(os.path.join(ROOT, "scenes.json"), encoding="utf-8"))
SC = D["scenes"]; TOTAL = D["total"]
OUT = os.path.join(ROOT, "out")
META = D.get("meta", {})
NAME = META.get("out_name", "video")
AFTER = META.get("afterglow_part", "余韻")
AUDIO = os.path.join(OUT, f"{NAME}_audio.wav")
MP4 = os.path.join(OUT, f"{NAME}.mp4")
SRT = os.path.join(OUT, f"{NAME}.srt")
DESC = os.path.join(OUT, f"{NAME}_概要欄.txt")
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

def by_text(kind):
    return next((s for s in SC if s.get("text") == kind), None)

def after_start():
    return next((s["start"] for s in SC if s["part"] == AFTER), None)

# ───────── 結合 ─────────
def mux():
    v = os.path.join(ROOT, "work/video.mp4"); a = AUDIO
    # 中間ファイル（約30Mbps）を、YouTube向けの容量に再エンコード
    r = run(["ffmpeg", "-v", "error", "-y", "-i", v, "-i", a, "-map", "0:v:0", "-map", "1:a:0",
             "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-maxrate", "14M", "-bufsize", "28M", "-pix_fmt", "yuv420p",
             "-g", "60", "-bf", "2", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
             "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-shortest", "-movflags", "+faststart",
             "-metadata", f"title={META.get('title', NAME)} {META.get('subtitle', '')}".strip(), MP4])
    if r.returncode: sys.exit(r.stderr)

# ───────── 字幕（セリフ＋最低限の音の説明） ─────────
def srt():
    rep = json.load(open(os.path.join(ROOT, "work/mix_report.json"), encoding="utf-8"))
    items = []
    ti = by_text("title")
    if ti and META.get("title"): items.append((ti["start"] + 1.8, ti["start"] + 8.4, f"{META['title']}\n{META.get('subtitle', '')}".strip()))
    caps = META.get("sfx_captions", {"chime5": "♪（夕方5時のチャイム）"})
    for x in SC:
        for (nm, off, _g) in x["sfx"]:
            if nm in caps: items.append((x["start"] + off + 0.2, x["start"] + off + 6.0, caps[nm]))
    for (lid, a, b, who, text) in rep["lines"]:
        items.append((a - 0.1, max(b + 0.6, a + 2.2), f"{who}：{text}"))
    end = by_text("end")
    if end and META.get("end_question"): items.append((end["start"] + 3.2, end["start"] + 8.6, META["end_question"]))
    ag = by_text("afterglow")
    if ag and META.get("afterglow_title"): items.append((ag["start"] + 0.8, ag["start"] + 5.4, f"{META['afterglow_title']}\n{META.get('afterglow_sub', '')}".strip()))
    items.sort()
    # 次の字幕が始まる前に終える（重なると2行が同時に出る）
    items = [(a, min(b, items[k + 1][0] - 0.05) if k + 1 < len(items) else b, t) for k, (a, b, t) in enumerate(items)]
    with open(SRT, "w", encoding="utf-8") as f:
        for k, (a, b, t) in enumerate(items, 1):
            f.write(f"{k}\n{ts(a)} --> {ts(b)}\n{t}\n\n")
    return len(items)

# ───────── 概要欄 ─────────
def description():
    chap = []; seen = None
    names = META.get("chapters", {})
    for s in SC:
        if s["part"] != seen:
            chap.append(f"{mmss(s['start'])} {names.get(s['part'], s['part'])}"); seen = s["part"]
    ag = after_start()
    tpl = os.path.join(ROOT, "description_template.txt")
    if os.path.exists(tpl):
        txt = open(tpl, encoding="utf-8").read().replace("{chapters}", "\n".join(chap)).replace("{afterglow_start}", mmss(ag) if ag is not None else "")
        if "〈" in txt: print("※ 概要欄に〈 〉の書きかけが残っています（description_template.txt を作品に合わせて埋めてください）")
    else:
        print("※ description_template.txt がないので、最小限の概要欄を作ります（AI開示・出典・商標を書き足すこと）")
        txt = (f"{META.get('title', '')} {META.get('subtitle', '')}\n\n{META.get('end_question', '')}\n\n▼チャプター\n" + "\n".join(chap) +
               "\n\n▼制作について\n・映像・音楽・声は生成AIで作り、プログラムで仕上げています。実在の記録ではなく、AIで作った再現・フィクションです。\n")
    open(DESC, "w", encoding="utf-8").write(txt)
    return len(chap)

# ───────── サムネイル ─────────
def thumb(src_id, out, text=None, sub=None, stamp=True, crop=None):
    sys.path.insert(0, HERE)
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
    if stamp:   # True なら meta.stamp_text、文字列ならその日付（例 "'97 7 26"）
        st = render.datestamp(stamp if isinstance(stamp, str) else META.get("stamp_text", "'97 8 3"), scale=1.15)
        img.alpha_composite(st, (1280 - st.width - 18, 720 - st.height - 6))
    img.convert("RGB").save(out, quality=92)

# ───────── 検査 ─────────
def check():
    res = {}
    if not os.path.exists(MP4): sys.exit(f"{MP4} がありません（先に finalize.py を引数なしで）")
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
        lo = max(-60.0, min(x[1] for x in st[max(0, i - 20):i + 1]))   # 無音（-inf 付近）は -60 とみなす
        if s - lo >= 8 and s > -30 and t > 5: jumps.append((round(t, 1), round(s - lo, 1)))   # 冒頭5秒は3秒窓がたまっていない
    merged = []
    for t, d_ in jumps:
        if not merged or t - merged[-1][0] > 3: merged.append([t, d_])
        else: merged[-1][1] = max(merged[-1][1], d_)
    res["sudden_loudness"] = merged
    ag = after_start() or TOTAL
    sa = [s for t, s in st if t < ag]; sb = [s for t, s in st if t >= ag + 6]
    res["short_term_median"] = dict(story=round(statistics.median(sa), 1) if sa else None, afterglow=round(statistics.median(sb), 1) if sb else None)
    # 黒コマ・停止・無音
    bd = run(["ffmpeg", "-nostats", "-i", MP4, "-vf", "blackdetect=d=0.5:pix_th=0.06", "-an", "-f", "null", "-"]).stderr
    res["black"] = [(float(a), float(b)) for a, b in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", bd)]
    sd = run(["ffmpeg", "-nostats", "-i", MP4, "-af", "silencedetect=n=-55dB:d=1.5", "-vn", "-f", "null", "-"]).stderr
    res["silence"] = [(float(a)) for a in re.findall(r"silence_start: (-?[\d.]+)", sd)]
    # カットの長さ
    durs = [s["dur"] for s in SC if s["part"] != AFTER]
    res["cut_len_story"] = dict(mean=round(statistics.mean(durs), 2), min=min(durs), max=max(durs), n=len(durs))
    ok = dict(
        resolution=[res["video"]["w"], res["video"]["h"]] == list(D["size"]),
        fps=abs(res["video"]["fps"] - D["fps"]) < 0.01,
        duration=abs(res["duration"] - TOTAL) < 1.5,
        loudness=abs(res["loudness"]["I"] + 14) <= 1.0,
        true_peak=res["loudness"]["TP"] <= -1.0,
        no_unintended_black=all(a < 2.0 or b > TOTAL - 5 for a, b in res["black"]),
        no_sudden_loudness=not res["sudden_loudness"],
        voices_present=all(os.path.exists(os.path.join(ROOT, "assets/voice", f"{lid}.wav")) for lid in D.get("lines", {})),
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
    font = ImageFont.truetype(FONT_TITLE, 14)
    for k, f in enumerate(fs):
        im = Image.open(os.path.join(tmp, f)); x = (k % cols) * 324; y = (k // cols) * 200
        sheet.paste(im, (x, y)); d.text((x + 4, y + 182), mmss(k * step), fill=(255, 255, 0), font=font)
    sheet.save(out, quality=82)
    return out, len(fs)

def remux_audio():
    """映像はそのまま（再エンコードなし）で、音声だけ最新のミックスに差し替える"""
    a = AUDIO
    for src, br in ((MP4, "256k"), (os.path.join(OUT, f"{NAME}_プレビュー540p.mp4"), "128k")):
        if not os.path.exists(src): continue
        tmp = src + ".tmp.mp4"
        r = run(["ffmpeg", "-v", "error", "-y", "-i", src, "-i", a, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", br,
                 "-ar", "48000", "-shortest", "-movflags", "+faststart", tmp])
        if r.returncode: sys.exit(r.stderr)
        os.replace(tmp, src)
    print("audio replaced")

def preview():
    """アプリで見る用の軽い版（960×540、粒子をならして小さく）"""
    out = os.path.join(OUT, f"{NAME}_プレビュー540p.mp4")
    r = run(["ffmpeg", "-v", "error", "-y", "-i", MP4, "-vf", "scale=960:540:flags=lanczos,hqdn3d=1.5:1.5:3:3", "-c:v", "libx264", "-preset", "medium",
             "-crf", "25", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out])
    if r.returncode: print(r.stderr)
    return out, round(os.path.getsize(out) / 1e6, 1)

def small_preview(max_mb=28.0, height=360):
    """アプリなどで送れる大きさのプレビュー（2パスで容量を合わせる）"""
    out = os.path.join(OUT, f"{NAME}_プレビュー{height}p.mp4")
    dur = float(json.loads(run(["ffprobe", "-v", "error", "-show_format", "-of", "json", MP4]).stdout)["format"]["duration"])
    abr = 64
    vbr = int((max_mb * 8e6 * 0.97) / dur / 1000) - abr
    if vbr < 150: print(f"※ {dur:.0f}秒だと {max_mb}MB では画質が足りません（{vbr}kbps）。高さを下げるか分割を")
    log = os.path.join(ROOT, "work", "x264_2pass")
    vf = f"scale=-2:{height}:flags=lanczos,hqdn3d=2:2:4:4"
    common = ["-vf", vf, "-c:v", "libx264", "-preset", "medium", "-b:v", f"{vbr}k", "-pix_fmt", "yuv420p", "-passlogfile", log]
    r1 = run(["ffmpeg", "-v", "error", "-y", "-i", MP4] + common + ["-pass", "1", "-an", "-f", "mp4", os.devnull])
    r2 = run(["ffmpeg", "-v", "error", "-y", "-i", MP4] + common + ["-pass", "2", "-c:a", "aac", "-b:a", f"{abr}k", "-ac", "2", "-movflags", "+faststart", out])
    if r1.returncode or r2.returncode: print(r1.stderr, r2.stderr)
    return out, round(os.path.getsize(out) / 1e6, 1)

if __name__ == "__main__":
    if "--small" in sys.argv:
        print("small preview:", small_preview()); sys.exit(0)
    if "--audio" in sys.argv:
        remux_audio(); print("srt items:", srt())
    elif "--check" not in sys.argv:
        mux(); print("mux ->", MP4)
        print("srt items:", srt())
        print("chapters:", description())
        for th in META.get("thumbs", []):
            src = scene(th["scene"]).get("img") or th["scene"]
            thumb(src, os.path.join(OUT, th["name"] + ".jpg"), text=th.get("text"), sub=th.get("sub"), stamp=th.get("stamp", False), crop=th.get("crop"))
        print("thumbnails done")
    check()
    print("sheet:", contact_sheet())
    if "--check" not in sys.argv and "--audio" not in sys.argv:
        print("preview:", preview())
