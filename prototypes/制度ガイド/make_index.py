"""プレビューの入口（index.html）を作る。見た目は前の特典プレビュー（NISAのはじめ方）と同じ部品を使う。"""
import html as H
import importlib.util
import json
import pathlib
import subprocess
import sys
import urllib.parse

HERE = pathlib.Path(__file__).parent
# 短い動画の表（clips.py）と書き出した動画のある所。リポジトリでは 動画づくり/、作業中は ../seido-video/
VIDEO_DIR = next(p for p in [HERE / "動画づくり", HERE.parent / "seido-video"] if (p / "clips.py").exists())
sys.path.insert(0, str(VIDEO_DIR))
from clips import CLIPS, FULL, GROUPS  # noqa: E402
BASE_CSS = HERE / "_showcase_base.css"  # 前の特典プレビュー（NISAのはじめ方）の部品
DATA = next(p for p in [HERE.parents[1] / "reports" / "制度データ 2026-10.json", pathlib.Path("/home/user/-/reports/制度データ 2026-10.json")] if p.exists())
REPO = "https://github.com/akamar08taiyo-bot/-/blob/claude/money-youtube-viral-research/reports/"
SCRIPTS = "https://claude.ai/artifact/393v7w1BTGuUvnP3rHmDCV"
GALLERY = "https://claude.ai/artifact/88Bki2FczPnw7y4fV4iZnx"
NISA = "https://claude.ai/artifact/UhvRPzh38U6Uq7igZjmEH4"
ARROW = ('<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>')
OUT = ('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
       'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/></svg>')


def repo(name):
    return REPO + urllib.parse.quote(name)


def old_css():
    css = BASE_CSS.read_text(encoding="utf-8")
    css = css.replace("/* Layout: 動画の最後で配る3つの特典を、机に並べた見本のように。紙（PDF）とスマホ（アプリ）のポスター＋説明＋ボタン */",
                      "/* Layout: 偉人編の動画の最後で配る3つのプレゼントを、スマホ2台のポスターで並べる。下に、つながる動画と資料 */")
    return css


NEW_CSS = """
/* 動画で見る */
[hidden]{display:none!important}
.sec-head{display:grid;gap:4px;max-width:46rem}
.sec-head h2{font-size:24px;line-height:1.45;letter-spacing:-.02em;font-weight:800;text-wrap:balance}
.sec-head p{font-size:15px;color:var(--muted)}
.kicker{font-size:13px;font-weight:700;letter-spacing:.06em;color:var(--accent-ink)}
.vids,.docs{display:grid;gap:14px}
.vpick{display:grid;gap:16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px}
@media(min-width:700px){.vpick{padding:20px 22px}}
.vstep{display:grid;gap:8px;min-width:0}
.vstep-label{display:flex;align-items:baseline;gap:8px;font-size:15px;font-weight:800}
.vstep-label b{font:400 24px/1 var(--num);color:var(--accent)}
.vseg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
@media(min-width:760px){.vseg{grid-template-columns:repeat(4,minmax(0,1fr))}}
.vseg button{display:grid;gap:2px;align-content:center;min-height:58px;padding:8px 12px;border:1.5px solid var(--ink);border-radius:8px;background:transparent;color:var(--ink);text-align:left;line-height:1.35}
.vseg button span{font-size:15px;font-weight:800}
.vseg button small{font-size:12px;color:var(--muted)}
.vseg button[aria-pressed=true]{background:var(--btn-bg);border-color:var(--btn-bg);color:var(--btn-fg)}
.vseg button[aria-pressed=true] small{color:inherit;opacity:.85}
@media(max-width:400px){.vseg button{padding:8px 10px}.vseg button span{font-size:clamp(12.5px,3.6vw,15px);letter-spacing:-.01em}.vseg button small{font-size:clamp(11px,3.1vw,12px)}}
.vchips{display:flex;flex-wrap:wrap;gap:8px}
.vchips button{min-height:42px;padding:4px 15px;border:1.5px solid var(--ink);border-radius:999px;background:transparent;color:var(--ink);font-size:14px;font-weight:700;line-height:1.3}
.vchips button[aria-pressed=true]{background:var(--btn-bg);border-color:var(--btn-bg);color:var(--btn-fg)}
@media(hover:hover){.vseg button:hover,.vchips button:hover{background:var(--pale)}.vseg button[aria-pressed=true]:hover,.vchips button[aria-pressed=true]:hover{background:var(--btn-bg)}}
.vbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.vcount{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.vplay-all{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:6px 16px;border-radius:8px;border:1.5px solid var(--btn-bg);background:var(--btn-bg);color:var(--btn-fg);font-size:15px;font-weight:700}
.vplay-all:disabled{opacity:.45;cursor:default}
.vlists{display:grid;gap:10px}
.vlist-head{display:flex;align-items:center;gap:8px;margin-top:4px;font-size:16px;font-weight:800}
.vlist-head::before{content:"";flex:none;width:4px;height:1.1em;border-radius:2px;background:var(--accent)}
.vgrid{list-style:none;padding:0;display:grid;gap:10px}
@media(min-width:760px){.vgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1060px){.vgrid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.vcard{position:relative;display:grid;grid-template-columns:92px minmax(0,1fr);gap:12px;align-items:start;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px}
@media(hover:hover){.vcard:hover{border-color:var(--ink)}.vcard:hover .vbtn{background:var(--accent)}}
.vthumb{position:relative;width:92px;aspect-ratio:9/16;border-radius:7px;overflow:hidden;background:var(--pale)}
.vthumb img{display:block;width:100%;height:100%;object-fit:cover}
.vrank{position:absolute;left:4px;top:4px;max-width:calc(100% - 8px);background:var(--btn-bg);color:var(--btn-fg);font-size:11px;font-weight:700;line-height:1.6;border-radius:4px;padding:0 5px;white-space:nowrap}
.vdur{position:absolute;right:4px;bottom:4px;background:#000000b8;color:#fff;font-size:11px;font-weight:700;line-height:1.6;border-radius:4px;padding:0 5px;font-variant-numeric:tabular-nums}
.vbtn{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:#143e35d9;color:#fff;display:grid;place-items:center;transition:background .2s}
.vbody{display:grid;gap:3px;min-width:0}
.vfor{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:12px;font-weight:700;color:var(--muted);line-height:1.6}
.vtag{border:1px solid var(--line);border-radius:4px;padding:0 6px;background:var(--bg);color:var(--ink)}
.vtag.is-hit{background:var(--accent);border-color:var(--accent);color:#fff}
.vcard h3{margin-top:2px;font-size:16px;line-height:1.5;font-weight:800}
.vopen{margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.vopen::after{content:"";position:absolute;inset:0;border-radius:10px}
.vopen:focus-visible{outline:none}
.vopen:focus-visible::after{outline:3px solid var(--accent);outline-offset:2px}
.vwhen{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;font-size:13px;font-weight:700;color:var(--accent-ink)}
.vstatus{display:inline-block;font-size:11px;font-weight:700;line-height:1.6;border-radius:999px;padding:0 8px;border:1px solid currentColor;color:var(--accent-ink);white-space:nowrap}
.vpoint{font-size:13px;line-height:1.7;color:var(--muted)}
.vempty{display:grid;gap:10px;background:var(--surface);border:1px dashed var(--line);border-radius:10px;padding:16px;font-size:15px}
.vempty-actions{display:flex;flex-wrap:wrap;gap:8px}
.vempty-actions button{min-height:42px;padding:4px 14px;border:1.5px solid var(--ink);border-radius:8px;background:transparent;color:var(--ink);font-size:14px;font-weight:700}
.vfull{display:grid;gap:10px;margin-top:6px}
.vfull h3{font-size:16px;font-weight:800}
.vfull p{font-size:14px;color:var(--muted)}
.vfull-list{list-style:none;padding:0 0 6px;display:grid;grid-auto-flow:column;grid-auto-columns:112px;gap:10px;overflow-x:auto;scroll-snap-type:x proximity;overscroll-behavior-x:contain}
@media(min-width:760px){.vfull-list{grid-auto-flow:row;grid-template-columns:repeat(5,minmax(0,150px));overflow:visible}}
.vfull-list li{scroll-snap-align:start;min-width:0}
.vfull-card{display:grid;gap:6px;width:100%;margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.vfull-card img{display:block;width:100%;aspect-ratio:9/16;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
.vfull-card small{font-size:12px;font-weight:700;color:var(--accent-ink)}
.vfull-card b{font-size:13px;line-height:1.5}
@media(hover:hover){.vfull-card:hover b{text-decoration:underline;text-underline-offset:4px}}

/* 再生する画面（いつも暗い色） */
html.v-open{overflow:hidden}
.vplayer{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:var(--v-bg);color:var(--v-ink);overflow:hidden}
.vplayer::backdrop{background:#000000c4}
.vp-wrap{position:relative;display:flex;flex-direction:column;height:100%}
.vp-stage{flex:none;display:flex;justify-content:center;height:min(62vh,calc(100vw * 16 / 9));background:#000}
@supports(height:1dvh){.vp-stage{height:min(62dvh,calc(100vw * 16 / 9))}}
.vp-stage video{display:block;height:100%;max-width:100%;aspect-ratio:9/16;background:#000}
.vp-side{flex:1;min-height:0;overflow-y:auto;display:grid;align-content:start;gap:10px;padding:14px 16px 22px}
.vp-close{position:absolute;top:10px;right:10px;z-index:2;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;border:1px solid #ffffff4d;background:#000000a6;color:#fff;font-size:22px;line-height:1}
.vp-kicker{padding-right:44px;font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--v-accent)}
.vplayer h2{font-size:20px;line-height:1.45;font-weight:800;text-wrap:balance}
.vplayer .vfor{color:var(--v-muted)}
.vplayer .vtag{background:transparent;color:var(--v-ink);border-color:var(--v-line)}
.vp-facts{display:grid;grid-template-columns:4.6em minmax(0,1fr);gap:6px 10px;margin:0;font-size:14px;line-height:1.7}
.vp-facts dt{padding-top:2px;font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--v-muted)}
.vp-facts dd{margin:0;min-width:0}
.vp-facts .vstatus{margin-left:8px;color:var(--v-accent)}
.vp-chapters{list-style:none;padding:0;display:grid;gap:2px}
.vp-chapters button{display:flex;gap:10px;width:100%;margin:0;padding:8px 10px;border:0;border-radius:6px;background:none;color:inherit;font:inherit;font-size:14px;line-height:1.5;text-align:left;cursor:pointer}
.vp-chapters button:hover,.vp-chapters button[aria-current=true]{background:var(--v-btn)}
.vp-chapters button[aria-current=true]{font-weight:700}
.vp-chapters time{flex:none;min-width:2.6em;color:var(--v-accent);font-variant-numeric:tabular-nums}
.vp-nav{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-top:4px}
.vp-nav button{min-height:46px;border-radius:8px;border:1px solid var(--v-line);background:var(--v-btn);color:var(--v-ink);font-size:15px;font-weight:700}
.vp-nav button:disabled{opacity:.35;cursor:default}
.vp-pos{font-size:13px;color:var(--v-muted);font-variant-numeric:tabular-nums;text-align:center}
.vp-auto{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--v-muted)}
.vp-auto input{width:18px;height:18px;accent-color:var(--v-accent)}
.vp-link{justify-self:start;font-size:14px;font-weight:700;color:var(--v-ink)}
.vp-msg{font-size:14px;color:var(--v-accent)}
.vp-msg:empty{display:none}
.vp-note{font-size:12px;line-height:1.7;color:var(--v-muted)}
.vplayer :focus-visible{outline-color:var(--v-accent)}
@media(min-width:760px){
  .vplayer{inset:0;width:min(980px,94vw);height:min(92vh,880px);margin:auto;border-radius:14px}
  .vp-wrap{flex-direction:row}
  .vp-stage{height:100%;width:auto;aspect-ratio:9/16}
  .vp-side{padding:24px 26px}
  .vp-close{top:14px;right:14px;background:var(--v-btn);border-color:var(--v-line)}
}

/* 資料 */
.doc-list{list-style:none;padding:0;display:grid;gap:10px}
@media(min-width:900px){.doc-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
.doc{display:grid;gap:4px;min-width:0;padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:10px;text-decoration:none}
.doc:hover{border-color:var(--ink)}
.doc b{display:flex;align-items:center;gap:8px;font-size:16px;line-height:1.5}
.doc b svg{flex:none;color:var(--accent)}
.doc span{font-size:14px;color:var(--muted);line-height:1.7}
.doc small{font-size:12px;font-weight:700;letter-spacing:.06em;color:var(--accent-ink)}
.sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important}}
"""

SHORT = {"all": "ほとんどの人", "kaishain": "会社員", "part": "パート", "jieigyo": "自営業", "nenkin": "年金",
         "kosodate": "子育て", "iryo": "通院・薬", "kaigo": "介護"}
WHO_CHIPS = ["kaishain", "part", "jieigyo", "nenkin", "kosodate", "iryo", "kaigo"]
# 動画を見たあと、くわしく確かめるプレゼント
GIFT_LINK = {
    "kaisei1p": ("制度改正まとめで、条件までくわしく見る", "kaisei.html"),
    "kaisei2p": ("制度改正まとめで、条件までくわしく見る", "kaisei.html"),
    "seido1p": ("あなたに合う制度を診断する", "shindan.html"),
    "seido2p": ("給付金・手当の一覧（年金）を見る", "kyufu.html#nenkin"),
    "seido3p": ("給付金・手当の一覧（介護）を見る", "kyufu.html#kaigo"),
}
PLAY = ('<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>')


DURATIONS = json.loads((VIDEO_DIR / "durations.json").read_text(encoding="utf-8")) if (VIDEO_DIR / "durations.json").exists() else {}


def duration(path, fallback, key=None):
    """動画の長さ（秒）。動画がない所で組み立てるときは durations.json、なければ表の値を使う。"""
    if not path.exists() and key in DURATIONS:
        return DURATIONS[key]
    if path.exists():
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                             capture_output=True, text=True)
        if out.returncode == 0 and out.stdout.strip():
            return round(float(out.stdout), 1)
    return round(fallback, 1)


def rank_label(c):
    return c["rank"] if "位" in c["rank"] else "その" + c["rank"]


# 制度ガイドの動画（1本1制度・制作セッションで作る）。「いつの制度」ごとに全部そろったら、切り出し動画と入れ替える
GUIDE_FILE = VIDEO_DIR / "台本" / "gift_eps.py"
GUIDE_READY = VIDEO_DIR / "guide_ready.json"  # 取りこんだ動画の長さ {"g01": 秒, ...}
GUIDE_LINK = {
    "g11": ("あなたに合う制度を診断する", "shindan.html"), "g12": ("あなたに合う制度を診断する", "shindan.html"),
    "g13": ("給付金・手当の一覧（年金）を見る", "kyufu.html#nenkin"), "g14": ("給付金・手当の一覧（年金）を見る", "kyufu.html#nenkin"),
    "g15": ("給付金・手当の一覧（介護）を見る", "kyufu.html#kaigo"), "g16": ("給付金・手当の一覧（介護）を見る", "kyufu.html#kaigo"),
}


def load_guide():
    if not GUIDE_FILE.exists():
        return [], {}
    spec = importlib.util.spec_from_file_location("gift_eps", GUIDE_FILE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    ready = json.loads(GUIDE_READY.read_text(encoding="utf-8")) if GUIDE_READY.exists() else {}
    return mod.EPISODES, ready


def guide_entry(ep, dur):
    tags = [t for t in ep["who"] if t != "all"]
    link = GUIDE_LINK.get(ep["id"]) or ("制度改正まとめで、条件までくわしく見る", "kaisei.html" + ("#" + tags[0] if tags else ""))
    return {"id": ep["id"], "src": ep["id"], "group": ep["group"], "no": "", "rank": "", "rankLabel": "",
            "title": ep["name"], "when": ep["when"].replace("（法案）", ""), "who": ep["who"], "status": ep["status"],
            "point": ep["point"], "todo": ep["todo"], "at": 0, "dur": dur, "guide": True,
            "video": f"video/guide/{ep['id']}.mp4", "poster": f"video/posters/{ep['id']}.webp", "link": list(link)}


def video_section():
    groups = [{"key": k, "label": label, "sub": sub} for k, label, sub in GROUPS]
    group_label = {k: label for k, label, _ in GROUPS}
    group_label["all"] = "ぜんぶの時期"
    clips = []
    for c in CLIPS:
        no = FULL[c["src"]][0]
        tags = [t for t in c["who"] if t != "all"]
        link_text, link = GIFT_LINK[c["src"]]
        if link == "kaisei.html" and tags:
            link += "#" + tags[0]
        clips.append({
            "id": c["id"], "src": c["src"], "group": FULL[c["src"]][3], "no": no, "rank": c["rank"], "rankLabel": rank_label(c),
            "title": c["title"], "when": c["when"], "who": c["who"], "status": c.get("status", "決定"),
            "point": c["point"], "todo": c["todo"], "at": c["start"],
            "dur": duration(VIDEO_DIR / "out" / "clips" / f"{c['id']}.mp4", c["end"] - c["start"], c["id"]),
            "video": f"video/clips/{c['id']}.mp4", "poster": f"video/posters/{c['id']}.webp", "link": [link_text, link],
        })
    full = []
    for key, (no, title, secs, group) in FULL.items():
        chapters, prev_end = [], None
        for c, raw in zip(clips, CLIPS):
            if c["src"] != key:
                continue
            at = prev_end if prev_end is not None and raw["start"] - prev_end < 6 else raw["start"]
            chapters.append({"at": round(at, 2), "label": c["rankLabel"] + "　" + c["title"]})
            prev_end = raw["end"]
        if chapters and chapters[0]["at"] > 0:
            chapters.insert(0, {"at": 0, "label": "はじめ"})
        full.append({"id": key, "src": key, "group": group, "no": no, "title": title,
                     "dur": duration(VIDEO_DIR / "src" / "videos" / f"{key}_duo.mp4", secs, key),
                     "video": f"video/full/{key}.mp4", "poster": f"video/posters/{key}.webp",
                     "chapters": chapters, "link": list(GIFT_LINK[key])})
    guide, ready = load_guide()
    use_guide = [g["key"] for g in groups
                 if any(ep["group"] == g["key"] for ep in guide) and all(ep["id"] in ready for ep in guide if ep["group"] == g["key"])]
    entries = []
    for g in groups:
        if g["key"] in use_guide:
            entries += [guide_entry(ep, ready[ep["id"]]) for ep in guide if ep["group"] == g["key"]]
        else:
            entries += [c for c in clips if c["group"] == g["key"]]
    n_guide = sum(1 for c in entries if c.get("guide"))
    data = {"groups": groups, "groupLabel": group_label, "tagLabel": SHORT, "clips": entries, "full": full}

    def esc(t):
        return H.escape(t, quote=True)

    def clock(sec):
        sec = round(sec)
        return f"{sec // 60}:{sec % 60:02d}"

    cards = []
    for c in entries:
        tags = "".join(f'<span class="vtag" data-tag="{t}">{esc(SHORT[t])}</span>' for t in c["who"])
        status = '<span class="vstatus">法案（まだ決まっていない）</span>' if c["status"] == "法案" else ""
        rank = f'<span class="vrank">{esc(c["rankLabel"])}</span>' if c["rankLabel"] else ""
        sr = esc(group_label[c["group"]]) if c.get("guide") else f"{c['no']}・{esc(c['rankLabel'])}"
        cards.append(f"""<li class="vcard" data-id="{c['id']}">
<div class="vthumb" aria-hidden="true"><img src="{c['poster']}" alt="" width="360" height="640" loading="lazy">{rank}<span class="vdur">{clock(c['dur'])}</span><span class="vbtn">{PLAY}</span></div>
<div class="vbody">
<p class="vfor">{tags}向け</p>
<h3><button type="button" class="vopen" data-play="{c['id']}">{esc(c['title'])}<span class="sr-only">（{sr}、{round(c['dur'])}秒の動画を再生）</span></button></h3>
<p class="vwhen">{esc(c['when'])}{status}</p>
<p class="vpoint">{esc(c['point'])}</p>
</div>
</li>""")

    # ボタンに入りきらない名前は短くする（文の中では長い名前のまま）
    btn = {"always": ("いつでも役立つ", "年金・介護の制度")}
    seg = "".join(f'<button type="button" data-group="{g["key"]}" aria-pressed="false"><span>{btn.get(g["key"], (g["label"],))[0]}</span>'
                  f'<small>{btn.get(g["key"], (None, g["sub"]))[1]}</small></button>' for g in groups)
    seg += f'<button type="button" data-group="all" aria-pressed="false"><span>ぜんぶ</span><small>{len(entries)}本すべて</small></button>'
    chips = '<button type="button" data-who="any" aria-pressed="true">すべて</button>' + "".join(
        f'<button type="button" data-who="{t}" aria-pressed="false">{SHORT[t]}</button>' for t in WHO_CHIPS)
    fulls = "".join(f"""<li><button type="button" class="vfull-card" data-full="{f['id']}"><img src="{f['poster']}" alt="" width="360" height="640" loading="lazy"><small>{f['no']}・{round(f['dur'])}秒</small><b>{esc(f['title'])}</b></button></li>"""
                    for f in full)

    if n_guide == len(entries):
        lead = f"制度ごとに1本ずつ、条件と「やること」まで説明する動画{len(entries)}本です。"
    elif n_guide:
        lead = f"制度ごとに条件と「やること」まで説明する動画（{n_guide}本）と、偉人編のショートを制度ごとに切り分けた動画を合わせた{len(entries)}本です。"
    else:
        lead = f"偉人編の5本を、制度ごとの短い動画{len(entries)}本に分けました。"
    full_head = "ショート版（5本）を通しで見る" if n_guide else "元の5本を通しで見る"
    full_lead = ("YouTube・Instagram向けに作った短い版です。再生中に、どこから見るかを選べます。" if n_guide
                 else "短く分ける前の動画です。再生中に、どこから見るかを選べます。")
    section = f"""<section class="vids" id="videos" aria-labelledby="vids-title">
    <div class="sec-head">
      <p class="kicker">動画で見る</p>
      <h2 id="vids-title"><span class="nb">知らないと損する制度を、</span><span class="nb">短い動画で</span></h2>
      <p>{lead}「いつの制度か」と「だれ向けか」を選ぶと、当てはまる動画だけが出ます。押すと、このページの中で再生します。</p>
    </div>
    <div class="vpick">
      <div class="vstep" role="group" aria-labelledby="vstep1">
        <p class="vstep-label" id="vstep1"><b>1</b>いつの制度？</p>
        <div class="vseg" id="v-groups">{seg}</div>
      </div>
      <div class="vstep" role="group" aria-labelledby="vstep2">
        <p class="vstep-label" id="vstep2"><b>2</b>だれ向け？</p>
        <div class="vchips" id="v-who">{chips}</div>
      </div>
    </div>
    <div class="vbar">
      <p class="vcount" id="v-count" aria-live="polite"></p>
      <button type="button" class="vplay-all" id="v-play-all">{PLAY}続けて再生</button>
    </div>
    <div class="vlists">
      <h3 class="vlist-head" id="v-head-direct" hidden></h3>
      <ol class="vgrid" id="v-grid">
{chr(10).join(cards)}
      </ol>
      <h3 class="vlist-head" id="v-head-general" hidden>ほとんどの人に関係する動画</h3>
      <ol class="vgrid" id="v-grid-general" hidden></ol>
      <div class="vempty" id="v-empty" hidden><p id="v-empty-msg"></p><div class="vempty-actions" id="v-empty-actions"></div></div>
    </div>
    <div class="vfull">
      <h3>{full_head}</h3>
      <p>{full_lead}</p>
      <ul class="vfull-list">{fulls}</ul>
    </div>
  </section>"""

    player = f"""<dialog class="vplayer" id="v-player" aria-labelledby="vp-title">
  <div class="vp-wrap">
    <div class="vp-stage"><video id="vp-video" controls playsinline preload="metadata"></video></div>
    <div class="vp-side">
      <p class="vp-kicker" id="vp-kicker"></p>
      <h2 id="vp-title"></h2>
      <p class="vfor" id="vp-for"></p>
      <div class="vp-nav"><button type="button" id="vp-prev">‹ 前へ</button><span class="vp-pos" id="vp-pos"></span><button type="button" id="vp-next">次へ ›</button></div>
      <p class="vp-msg" id="vp-msg" role="status"></p>
      <dl class="vp-facts" id="vp-facts"></dl>
      <ol class="vp-chapters" id="vp-chapters" aria-label="どこから見るか" hidden></ol>
      <label class="vp-auto"><input type="checkbox" id="vp-auto" checked>終わったら、次の動画を続けて再生</label>
      <a class="vp-link" id="vp-link" href="kaisei.html"></a>
      <p class="vp-note">制度は2026年10月時点。消費税1%と就業者負担軽減支援金は法案の段階です。動画の絵・声・BGMはAIで作っています。</p>
    </div>
    <button type="button" class="vp-close" id="vp-close" aria-label="閉じる" autofocus>×</button>
  </div>
</dialog>"""
    blob = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return section + "\n" + player + f'\n<script type="application/json" id="video-data">{blob}</script>', blob, len(entries), n_guide

def main():
    d = json.loads(DATA.read_text(encoding="utf-8"))
    n_kaisei = sum(1 for i in d["items"] if i.get("type") == "kaisei")
    n_benefit = len(d["benefits"])
    n_tabs = len(d["benefit_tabs"])

    video_html, video_json, n_clips, n_guide = video_section()
    if n_guide == n_clips:
        clip_note = "動画は「お金の動画制作」のセッションで、1本1制度で作りました（声と絵はAI）。制度の数字は2026年10月時点です。"
    elif n_guide:
        clip_note = f"動画のうち{n_guide}本は1本1制度で作ったもの、ほかは完成した5本を字幕と音の切れ目で切り分けたものです（残りも1本1制度の動画に入れ替えます）。"
    else:
        clip_note = "短い動画は、完成した5本を字幕と音の切れ目で切り分けたものです（声や絵は作り直していません）。TOP5の動画は、4位が短い（1〜2文）ので、5位と1本にまとめました。"

    docs = [
        (SCRIPTS, "台本帳", "偉人編 損する制度シリーズ", "制度編3本と改正TOP5の2本。配役・乱入・演出・出典まで、制作セッションに頼む文ごとワンタップでコピーできます。"),
        (GALLERY, "動画", "できあがった動画の一覧", "偉人版の39本（このシリーズの5本も入っています）。上の短い動画は、ここの5本を制度ごとに切り分けたものです。"),
        (repo("無料プレゼント 制度ガイドの計画.md"), "計画書", "無料プレゼント「制度ガイド」の計画", "3つのプレゼントの中身、作る順番、直すタイミング。"),
        (repo("制度データ 2026-10.json"), "データ", "制度データ（2026年10月5日時点）", f"改正{n_kaisei}件と給付金・手当{n_benefit}件。3つのプレゼントと動画の数字は、すべてここから。"),
        (repo("偉人編 損する制度シリーズ.md"), "レポート", "偉人編「知らないと損する制度」シリーズ", "シリーズの決まり、5本の台本、このあとの8本の骨組み。"),
        (NISA, "前に作った特典", "NISAのはじめ方 3つの特典", "ガイドPDF・逆算アプリ・証券会社えらび。同じサイトの無料特典です。"),
    ]
    doc_html = "\n".join(
        f'<li><a class="doc" href="{u}" target="_blank" rel="noopener"><small>{k}</small><b>{t} {OUT}</b><span>{s}</span></a></li>'
        for u, k, t, s in docs)

    html = f"""<title>制度ガイド プレビュー</title>
<style>{old_css()}{NEW_CSS}</style>

<div class="wrap">
  <header class="intro">
    <p class="brand"><img src="files/mascot.webp" alt="" width="44" height="44">おかねの地図<span class="pill">試作プレビュー</span></p>
    <h1><span class="nb">知らないと損する</span> <span class="nb">制度ガイド</span></h1>
    <p class="lead">偉人編「知らないと損する制度」の動画と、動画の最後で配る3つの無料プレゼントの試作です。動画は制度ごとに短く分けて、いつの制度か・だれ向けかで選べるようにしました。アプリはそのまま押して試せます。</p>
  </header>

  {video_html}

  <section class="path" aria-labelledby="path-title">
    <h2 id="path-title">視聴者がたどる道</h2>
    <ol class="flow">
      <li><span>偉人編の動画を見る。最後のひと言は「〜はプロフィールのリンクから！」</span></li>
      <li><span>プロフィールのリンクから、おかねの地図の無料プレゼントへ</span></li>
      <li><span>3つのプレゼントで、自分に関係する制度とやることを確かめる</span></li>
    </ol>
  </section>

  <section class="gifts" aria-label="3つの無料プレゼント">
    <article class="gift" aria-labelledby="g1-title">
      <a class="poster" href="kaisei.html" aria-label="プレゼント1の制度改正まとめを開く">
        <span class="phone"><img src="files/poster-kaisei-a.webp" alt="" width="360" height="720"></span>
        <span class="phone"><img src="files/poster-kaisei-b.webp" alt="" width="360" height="720"></span>
      </a>
      <div class="gift-body">
        <p class="gift-no"><b>1</b>プレゼント ・ Webページ</p>
        <h2 id="g1-title"><span class="nb">知らないと損する</span> <span class="nb">お金の制度改正まとめ</span></h2>
        <p>2026年11月から2027年度までに変わるお金のルールを、時期の順に並べました。</p>
        <nav class="chips" aria-label="だれ向けかを選んで開く"><a href="kaisei.html#kaishain">会社員</a><a href="kaisei.html#nenkin">年金</a><a href="kaisei.html#kosodate">子育て</a></nav>
        <ul class="facts">
          <li>改正{n_kaisei}件を「決定・法案・検討中」の札つきで</li>
          <li>いつから・だれに関係・やること・損する点がひと目で</li>
          <li>すべての項目に出典（国税庁・日本年金機構など）のリンク</li>
        </ul>
        <div class="actions">
          <a class="btn" href="kaisei.html">まとめを開く {ARROW}</a>
        </div>
      </div>
    </article>

    <article class="gift" aria-labelledby="g2-title">
      <a class="poster" href="shindan.html" aria-label="プレゼント2の診断を開く">
        <span class="phone"><img src="files/poster-shindan-a.webp" alt="" width="360" height="720"></span>
        <span class="phone"><img src="files/poster-shindan-b.webp" alt="" width="360" height="720"></span>
      </a>
      <div class="gift-body">
        <p class="gift-no"><b>2</b>プレゼント ・ Webアプリ</p>
        <h2 id="g2-title">あなたに合う制度の診断</h2>
        <p>年齢・働き方・家族・住まいにタップで答えると、関係しそうな制度だけを出します。</p>
        <ul class="facts">
          <li>7〜8問・1分ほど。名前や年収の金額は聞きません</li>
          <li>「やること」「知っておくこと」「決まったら」に分けて表示</li>
          <li>やることはチェックでき、結果はコピーしてメモに残せる</li>
        </ul>
        <div class="actions">
          <a class="btn" href="shindan.html">診断をはじめる {ARROW}</a>
        </div>
      </div>
    </article>

    <article class="gift" aria-labelledby="g3-title">
      <a class="poster" href="kyufu.html" aria-label="プレゼント3の給付金・手当の一覧を開く">
        <span class="phone"><img src="files/poster-kyufu-a.webp" alt="" width="360" height="720"></span>
        <span class="phone"><img src="files/poster-kyufu-b.webp" alt="" width="360" height="720"></span>
      </a>
      <div class="gift-body">
        <p class="gift-no"><b>3</b>プレゼント ・ Webページ</p>
        <h2 id="g3-title"><span class="nb">だれ向け？</span> <span class="nb">国の給付金・手当の一覧</span></h2>
        <p>申請しないともらえない国の給付金・手当を、だれ向けかで分けてまとめました。</p>
        <nav class="chips" aria-label="分類を選んで開く"><a href="kyufu.html#kosodate">子育て</a><a href="kyufu.html#kaigo">介護</a><a href="kyufu.html#nenkin">年金生活</a></nav>
        <ul class="facts">
          <li>{n_tabs}つの分類・{n_benefit}件。いくら・やること・窓口つき</li>
          <li>「遅れると損する」点を赤茶の字で強調</li>
          <li>市区町村ごとの補助は、全国の検索サイトでの探し方つき</li>
        </ul>
        <div class="actions">
          <a class="btn" href="kyufu.html">一覧を開く {ARROW}</a>
        </div>
      </div>
    </article>
  </section>

  <section class="docs" aria-labelledby="docs-title">
    <div class="sec-head">
      <h2 id="docs-title">資料</h2>
      <p>台本・計画・データのもと。新しいタブで開きます。</p>
    </div>
    <ul class="doc-list">
{doc_html}
    </ul>
  </section>

  <section class="notes" aria-labelledby="notes-title">
    <h2 id="notes-title">このプレビューについて</h2>
    <ul>
      <li>3つとも試作です。制度の内容は2026年10月5日時点で、国税庁・日本年金機構・厚生労働省などの資料と報道で確かめました。「法案」「検討中」は決まったら直します。</li>
      <li>診断の答えとチェックは、見ている端末の中だけに残ります（どこにも送りません）。</li>
      <li>{clip_note}</li>
      <li>選んだ時期・だれ向けと「続けて再生」の設定は、見ている端末の中だけに残ります。</li>
      <li>ページの上のメニューや、ほかのページへのリンクは、プレビューでは開きません。実際のサイトでは開きます。</li>
      <li>広告（アフィリエイト）は入れていません。実際のサイトに入れるときは、データの <code>制度データ 2026-10.json</code> を直せば3ページとも変わります。</li>
    </ul>
  </section>
</div>

<script>
(function () {{
  'use strict';
  try {{ localStorage.setItem('seido-guide:home', location.href.split('#')[0]); }} catch (e) {{ /* 保存が使えなくても動く */ }}
}}());
</script>
<script src="videos.js"></script>
"""
    (HERE / "index.html").write_text(html, encoding="utf-8")
    print("wrote index.html", len(html))


if __name__ == "__main__":
    main()
