#!/usr/bin/env python3
"""企画案のJSONから、ワンタップでコピーできるHTMLページを作る。

使い方:
    python3 make_copy_page.py plans.json out.html

JSONの形は references/plan_format.md の「コピー用ページ」を参照。
文章の中の [ラベル](URL) は、画面ではリンク、コピーでは「ラベル URL」になる。
"""
import html
import json
import re
import sys

LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")

ICON = (
    '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    '<rect x="9" y="9" width="11" height="11" rx="2"/>'
    '<path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>'
)

DEFAULT_PREFIX = (
    "お金のショートを作って（money-shorts）。次の企画案をもとに、60秒・18〜22行の台本にしてください。"
    "数字と制度は一次情報で確かめてから使ってください。\n\n"
)


def plain(text):
    """コピー用：リンクを「ラベル URL」にする（括弧の中でも読みやすいように）。"""
    return LINK.sub(lambda m: f"{m.group(1)} {m.group(2)}", text or "")


def rich(text):
    """画面用：エスケープしてからリンクを <a> にする。"""
    out, pos = [], 0
    text = text or ""
    for m in LINK.finditer(text):
        out.append(html.escape(text[pos:m.start()]))
        out.append(
            f'<a href="{html.escape(m.group(2), quote=True)}" target="_blank" rel="noopener">'
            f"{html.escape(m.group(1))}</a>"
        )
        pos = m.end()
    out.append(html.escape(text[pos:]))
    return "".join(out)


def esc(text):
    return html.escape(text or "", quote=True)


class Page:
    def __init__(self, data):
        self.data = data
        self.copy = {}
        self.all_texts = []
        self.prefix = data.get("money_shorts_prefix", DEFAULT_PREFIX)

    def button(self, key, text, what, aria, cls="mini", label="コピー"):
        self.copy[key] = text
        return (
            f'<button class="btn {cls}" type="button" data-copy="{esc(key)}" '
            f'data-what="{esc(what)}" aria-label="{esc(aria)}">{ICON}'
            f'<span class="lbl">{esc(label)}</span></button>'
        )

    # ---- 長尺 ----
    def long_text(self, p):
        lines = [f"【{p['no']}】{p['name']}（長尺）", "", "■動画タイトル案"]
        lines += [f"{i}. {t}" for i, t in enumerate(p["titles"], 1)]
        lines += ["", "■サムネイル文字", f"左：{p['thumb']['left']}", f"右：{p['thumb']['right']}"]
        lines += ["", "■構成", self.struct_text(p)]
        if p.get("caution"):
            lines += ["", "■注意", plain(p["caution"])]
        return "\n".join(lines)

    def struct_text(self, p):
        lines = [f"OP：{plain(p['op'])}", "本編："]
        lines += [plain(b) for b in p["body"]]
        lines.append(f"ED：{plain(p['ed'])}")
        return "\n".join(lines)

    def long_card(self, p):
        pid, no = p["id"], p["no"]
        full = self.long_text(p)
        self.all_texts.append(full)
        parts = [self.card_head(p, "長尺")]
        parts.append(self.button(f"{pid}.all", full, f"{no}", f"{no}をまるごとコピー", "primary", "この企画をまるごとコピー"))
        items = []
        for i, t in enumerate(p["titles"], 1):
            btn = self.button(f"{pid}.title{i}", t, f"タイトル案{i}", f"{no}のタイトル案{i}をコピー")
            items.append(f'<li><span class="tx">{esc(t)}</span>{btn}</li>')
        note = f'<p class="note">{esc(p["title_types"])}</p>' if p.get("title_types") else ""
        parts.append(f'<div class="block"><h4>タイトル案</h4><ol class="titles">{"".join(items)}</ol>{note}</div>')
        thumb_text = f"左：{p['thumb']['left']}\n右：{p['thumb']['right']}"
        parts.append(
            '<div class="block"><div class="block-head"><h4>サムネ文字</h4>'
            + self.button(f"{pid}.thumb", thumb_text, "サムネ文字", f"{no}のサムネ文字をコピー")
            + '</div><div class="thumb">'
            f'<div class="side"><span class="lab">左</span>{esc(p["thumb"]["left"])}</div>'
            f'<div class="side"><span class="lab">右</span>{esc(p["thumb"]["right"])}</div></div></div>'
        )
        body = "".join(f"<li>{rich(b)}</li>" for b in p["body"])
        parts.append(
            '<div class="block"><div class="block-head"><h4>構成</h4>'
            + self.button(f"{pid}.struct", self.struct_text(p), "構成", f"{no}の構成をコピー")
            + '</div><dl class="struct">'
            f"<dt>OP</dt><dd>{rich(p['op'])}</dd>"
            f"<dt>本編</dt><dd><ol>{body}</ol></dd>"
            f"<dt>ED</dt><dd>{rich(p['ed'])}</dd></dl></div>"
        )
        parts.append(self.caution(p))
        parts.append(self.why(p))
        return f'<article class="card" id="{esc(pid)}">{"".join(parts)}</article>'

    # ---- ショート ----
    def script_text(self, p):
        rows = []
        for s in p["script"]:
            label = f"（{s['label']}）" if s.get("label") else ""
            vis = f"〔見せ方：{s['visual']}〕" if s.get("visual") else ""
            rows.append(f"{s['time']}{label}{plain(s['text'])}{vis}")
        return "\n".join(rows)

    def short_text(self, p):
        lines = [f"【{p['no']}】{p['name']}（ショート・{p['seconds']}秒）", "", "■タイトル", p["title"]]
        lines += ["", "■サムネイル枠内テロップ", p["telop"]]
        lines += ["", f"■台本（{p['seconds']}秒）", self.script_text(p)]
        if p.get("ms_notes"):
            lines += ["", "■money-shortsに渡すときの注記"] + [f"・{plain(n)}" for n in p["ms_notes"]]
        if p.get("caution"):
            lines += ["", "■注意", plain(p["caution"])]
        return "\n".join(lines)

    def short_card(self, p):
        pid, no = p["id"], p["no"]
        full = self.short_text(p)
        self.all_texts.append(full)
        parts = [self.card_head(p, f"ショート・{p['seconds']}秒")]
        parts.append(self.button(f"{pid}.all", full, f"{no}", f"{no}をまるごとコピー", "primary", "この企画をまるごとコピー"))
        parts.append(self.button(f"{pid}.ms", self.prefix + full, "money-shortsに頼む文", f"{no}をmoney-shortsに頼む文でコピー", "secondary", "money-shorts に頼む文でコピー"))
        parts.append(
            '<div class="block"><h4>タイトル</h4><ol class="titles single"><li>'
            f'<span class="tx">{esc(p["title"])}</span>'
            + self.button(f"{pid}.title", p["title"], "タイトル", f"{no}のタイトルをコピー")
            + "</li></ol></div>"
        )
        parts.append(
            '<div class="block"><div class="block-head"><h4>サムネイル枠内テロップ</h4>'
            + self.button(f"{pid}.telop", p["telop"], "テロップ", f"{no}のテロップをコピー")
            + f'</div><div class="side wide">{esc(p["telop"])}</div></div>'
        )
        rows = []
        for s in p["script"]:
            lab = f'<span class="lab">{esc(s["label"])}</span>' if s.get("label") else ""
            vis = f'<span class="vis">見せ方 {esc(s["visual"])}</span>' if s.get("visual") else ""
            rows.append(f'<li><span class="tc">{esc(s["time"])}</span><div class="line">{lab}{rich(s["text"])}{vis}</div></li>')
        parts.append(
            f'<div class="block"><div class="block-head"><h4>台本（{p["seconds"]}秒）</h4>'
            + self.button(f"{pid}.script", self.script_text(p), "台本", f"{no}の台本をコピー")
            + f'</div><ol class="script">{"".join(rows)}</ol></div>'
        )
        if p.get("ms_notes"):
            notes = "".join(f"<li>{rich(n)}</li>" for n in p["ms_notes"])
            parts.append(f'<details class="ms"><summary>money-shorts に渡すときの注記</summary><ul>{notes}</ul></details>')
        parts.append(self.caution(p))
        parts.append(self.why(p))
        return f'<article class="card" id="{esc(pid)}">{"".join(parts)}</article>'

    # ---- 共通 ----
    def card_head(self, p, kind):
        badge = f'<span class="pill">{esc(p["badge"])}</span>' if p.get("badge") else ""
        return (
            f'<div class="card-head"><span class="no">{esc(p["no"])}</span>'
            f'<span class="pill when">{esc(p.get("when", ""))}</span>'
            f'<span class="pill">{esc(kind)}</span>{badge}</div>'
            f'<h3>{esc(p["name"])}</h3>'
        )

    def caution(self, p):
        if not p.get("caution"):
            return ""
        return f'<div class="caution"><h4>注意</h4><p>{rich(p["caution"])}</p></div>'

    def why(self, p):
        w = p.get("why")
        if not w:
            return ""
        ev = "".join(f"<li>{rich(e)}</li>" for e in w.get("evidence", []))
        now = f'<p><strong>今出す理由：</strong>{rich(w["now"])}</p>' if w.get("now") else ""
        return f'<details><summary>なぜこの企画？（根拠・今出す理由）</summary><ul>{ev}</ul>{now}</details>'

    def render(self):
        d = self.data
        sections = []
        for sec in d["sections"]:
            cards = [self.long_card(p) if p["kind"] == "long" else self.short_card(p) for p in sec["plans"]]
            sections.append(
                f'<section id="{esc(sec["id"])}"><h2>{esc(sec["heading"])}'
                f'<span class="count">{len(cards)}本</span></h2>'
                + (f'<p class="lead">{rich(sec["lead"])}</p>' if sec.get("lead") else "")
                + f'<div class="cards">{"".join(cards)}</div></section>'
            )
        chips = "".join(f'<a class="chip" href="#{esc(s["id"])}">{esc(s["heading"])}</a>' for s in d["sections"])
        now = ""
        if d.get("now"):
            items = "".join(
                f'<li><span class="pill when">{esc(n["when"])}</span><a href="#{esc(n["id"])}">{esc(n["label"])}</a></li>'
                for n in d["now"]
            )
            now = f'<section id="now" class="now"><h2>すぐ作るなら</h2><ol class="now-list">{items}</ol></section>'
        all_btn = self.button("all", "\n\n――――――――\n\n".join(self.all_texts), "全部の企画", "全部の企画をまとめてコピー", "secondary", "全部まとめてコピー")
        footer = "".join(f"<li>{rich(f)}</li>" for f in d.get("footer", []))
        copy_json = json.dumps(self.copy, ensure_ascii=False).replace("</", "<\\/")
        return TEMPLATE.format(
            title=esc(d["title"]),
            eyebrow=esc(d.get("eyebrow", "")),
            lead=rich(d.get("lead", "")),
            all_btn=all_btn,
            chips=chips,
            now=now,
            sections="".join(sections),
            footer=footer,
            copy_json=copy_json,
        )


TEMPLATE = """<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=IBM+Plex+Mono:wght@500&family=Zen+Kaku+Gothic+New:wght@400;700&display=swap">
<style>
/* Layout: 1列の台本カード。上に目次チップを固定し、ショートの台本は左に時刻の列を置く */
:root{{
  --bg:#F1F4F0; --surface:#FFFFFF; --surface-2:#F6F8F5; --ink:#17201C; --muted:#55625C; --line:#D5DCD7;
  --accent:#1C6854; --accent-ink:#FFFFFF; --accent-soft:#DFEDE6;
  --tag:#F2E09B; --tag-ink:#463700; --warn-soft:#FAF0D7; --warn-ink:#634400; --shadow:rgba(16,24,20,.16);
  --font-display:"Dela Gothic One","Hiragino Sans","Noto Sans JP",system-ui,sans-serif;
  --font-body:"Zen Kaku Gothic New","Hiragino Sans","Noto Sans JP",system-ui,sans-serif;
  --font-mono:"IBM Plex Mono",ui-monospace,"SFMono-Regular",Menlo,monospace;
}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{
  --bg:#0D1311; --surface:#141C19; --surface-2:#19231F; --ink:#E4EBE7; --muted:#9BAAA3; --line:#27332E;
  --accent:#5DC4A4; --accent-ink:#04211A; --accent-soft:#183029;
  --tag:#4C4115; --tag-ink:#F4E5A6; --warn-soft:#2D2412; --warn-ink:#F0D69A; --shadow:rgba(0,0,0,.5); color-scheme:dark}}}}
:root[data-theme="dark"]{{
  --bg:#0D1311; --surface:#141C19; --surface-2:#19231F; --ink:#E4EBE7; --muted:#9BAAA3; --line:#27332E;
  --accent:#5DC4A4; --accent-ink:#04211A; --accent-soft:#183029;
  --tag:#4C4115; --tag-ink:#F4E5A6; --warn-soft:#2D2412; --warn-ink:#F0D69A; --shadow:rgba(0,0,0,.5); color-scheme:dark}}
body{{background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:15px;line-height:1.75}}
.wrap{{max-width:720px;margin:0 auto;padding-inline:16px;padding-block:20px 96px}}
.eyebrow{{margin:0;font-size:12px;letter-spacing:.08em;color:var(--muted)}}
h1{{font-family:var(--font-display);font-weight:400;font-size:clamp(28px,7.5vw,40px);line-height:1.25;margin:4px 0 8px;text-wrap:balance}}
.lead{{margin:0 0 12px;color:var(--muted);max-width:40em}}
header{{display:grid;gap:4px}}
.chips{{position:sticky;top:env(safe-area-inset-top,0px);z-index:5;display:flex;gap:8px;overflow-x:auto;background:var(--bg);margin-inline:-16px;padding:10px 16px;border-bottom:1px solid var(--line);margin-top:16px}}
.chip{{flex:0 0 auto;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:14px;font-weight:700}}
section{{margin-top:28px;scroll-margin-top:64px}}
h2{{display:flex;align-items:baseline;gap:8px;font-size:20px;margin:0 0 12px;text-wrap:balance}}
h2 .count{{font-family:var(--font-mono);font-size:13px;color:var(--muted);font-weight:500}}
.now-list{{list-style:none;margin:0;padding:0;display:grid;gap:8px}}
.now-list li{{display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px}}
.now-list a{{font-weight:700;color:var(--ink);text-decoration-color:var(--accent);text-underline-offset:3px;min-width:0}}
.cards{{display:grid;gap:16px}}
.card{{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;gap:14px;scroll-margin-top:64px;min-width:0}}
.card-head{{display:flex;flex-wrap:wrap;align-items:center;gap:6px}}
.no{{font-family:var(--font-display);font-size:15px;color:var(--accent);margin-right:2px}}
.pill{{font-size:12px;line-height:1.6;padding:1px 10px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);color:var(--muted)}}
.pill.when{{background:var(--tag);color:var(--tag-ink);border-color:transparent;font-weight:700}}
.card h3{{margin:0;font-size:18px;line-height:1.5;text-wrap:balance}}
.btn{{font:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:14px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}}
.btn svg{{width:16px;height:16px;flex:0 0 auto}}
.btn.primary{{width:100%;min-height:48px;font-size:15px;background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}}
.btn.secondary{{width:100%}}
.btn.mini{{flex:0 0 auto;min-height:36px;padding:0 10px;font-size:13px}}
.btn[data-state="done"]{{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}}
.btn:focus-visible,.chip:focus-visible,a:focus-visible,summary:focus-visible{{outline:3px solid var(--accent);outline-offset:2px}}
.block{{display:grid;gap:8px;min-width:0}}
.block-head{{display:flex;align-items:center;justify-content:space-between;gap:8px}}
h4{{margin:0;font-size:13px;letter-spacing:.06em;color:var(--muted)}}
.titles{{list-style:none;margin:0;padding:0;display:grid;gap:8px;counter-reset:t}}
.titles li{{display:flex;align-items:flex-start;gap:10px;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:10px 10px 10px 12px}}
.titles .tx{{flex:1 1 auto;min-width:0;font-weight:700;line-height:1.6;overflow-wrap:anywhere}}
.titles:not(.single) .tx::before{{counter-increment:t;content:counter(t);font-family:var(--font-mono);font-weight:500;color:var(--accent);margin-right:8px}}
.note{{margin:0;font-size:13px;color:var(--muted)}}
.thumb{{display:grid;grid-template-columns:1fr 1fr;gap:8px}}
.side{{min-width:0;background:var(--surface-2);border:1px dashed var(--line);border-radius:10px;padding:10px 12px;font-weight:700;overflow-wrap:anywhere}}
.side .lab{{display:block;font-size:11px;font-weight:400;letter-spacing:.08em;color:var(--muted)}}
@media (max-width:360px){{.thumb{{grid-template-columns:1fr}}}}
.struct{{margin:0;display:grid;gap:6px}}
.struct dt{{font-family:var(--font-mono);font-size:12px;color:var(--accent)}}
.struct dd{{margin:0 0 4px;min-width:0;overflow-wrap:anywhere}}
.struct ol{{list-style:none;margin:0;padding:0;display:grid;gap:6px}}
.script{{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:10px;overflow:hidden}}
.script li{{display:grid;grid-template-columns:6.4em 1fr;gap:10px;padding:10px 12px;background:var(--surface-2);border-top:1px solid var(--line)}}
.script li:first-child{{border-top:0}}
.tc{{font-family:var(--font-mono);font-size:12px;color:var(--accent);font-variant-numeric:tabular-nums;padding-top:3px}}
.line{{min-width:0;overflow-wrap:anywhere}}
.line .lab{{font-size:12px;font-weight:700;color:var(--muted);margin-right:6px}}
.vis{{display:inline-block;margin-left:6px;padding:0 6px;border:1px solid var(--line);border-radius:6px;font-family:var(--font-mono);font-size:11px;color:var(--muted)}}
.caution{{background:var(--warn-soft);color:var(--warn-ink);border-radius:10px;padding:10px 12px;font-size:14px}}
.caution h4{{color:inherit}}
.caution p{{margin:4px 0 0}}
details{{border-top:1px solid var(--line);padding-top:10px;font-size:14px}}
details.ms{{border-top:0;padding-top:0;background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}}
summary{{cursor:pointer;color:var(--muted);font-weight:700}}
details ul{{margin:8px 0 0;padding-left:1.2em;display:grid;gap:4px}}
details p{{margin:8px 0 0}}
a{{color:var(--accent);overflow-wrap:anywhere}}
footer{{margin-top:32px;font-size:13px;color:var(--muted)}}
footer ul{{margin:0;padding-left:1.2em;display:grid;gap:4px}}
.toast{{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);max-width:calc(100% - 32px);background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:999px;font-size:14px;font-weight:700;opacity:0;pointer-events:none;transition:opacity .2s;z-index:20}}
.toast[data-show="1"]{{opacity:1}}
.sheet{{position:fixed;left:0;right:0;bottom:0;z-index:30;display:grid;gap:10px;background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -8px 24px var(--shadow);padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px))}}
.sheet p{{margin:0;font-size:14px}}
.sheet textarea{{width:100%;box-sizing:border-box;min-height:38vh;font:inherit;font-size:14px;line-height:1.6;background:var(--surface-2);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px}}
@media (prefers-reduced-motion: reduce){{.toast{{transition:none}}}}
</style>
<div class="wrap">
<header>
<p class="eyebrow">{eyebrow}</p>
<h1>{title}</h1>
<p class="lead">{lead}</p>
{all_btn}
</header>
<nav class="chips" aria-label="目次">{chips}</nav>
{now}
{sections}
<footer><ul>{footer}</ul></footer>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<div class="sheet" id="sheet" hidden>
<p>自動でコピーできませんでした。下の文字を長押しして「コピー」を選んでください。</p>
<textarea id="sheet-text" readonly aria-label="コピーする文章"></textarea>
<button class="btn" type="button" id="sheet-close">閉じる</button>
</div>
<script>
const COPY = {copy_json};
const toast = document.getElementById("toast");
let toastTimer;
function showToast(msg) {{
  toast.textContent = msg;
  toast.dataset.show = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {{ toast.dataset.show = "0"; }}, 1800);
}}
function markDone(btn) {{
  const label = btn.querySelector(".lbl");
  if (label && !btn.dataset.orig) btn.dataset.orig = label.textContent;
  if (label) label.textContent = "コピーしました";
  btn.dataset.state = "done";
  showToast((btn.dataset.what || "") + "をコピーしました");
  setTimeout(() => {{ btn.dataset.state = ""; if (label) label.textContent = btn.dataset.orig; }}, 1600);
}}
function legacyCopy(text) {{
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed"; ta.style.top = "0"; ta.style.left = "0"; ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false;
  try {{ ok = document.execCommand("copy"); }} catch (e) {{ ok = false; }}
  document.body.removeChild(ta);
  return ok;
}}
const sheet = document.getElementById("sheet");
const sheetText = document.getElementById("sheet-text");
function openSheet(text) {{
  sheetText.value = text;
  sheet.hidden = false;
  sheetText.focus();
  sheetText.select();
  sheetText.setSelectionRange(0, text.length);
}}
document.getElementById("sheet-close").addEventListener("click", () => {{ sheet.hidden = true; }});
document.addEventListener("click", (e) => {{
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  const text = COPY[btn.dataset.copy];
  if (text == null) return;
  const fallback = () => {{ if (legacyCopy(text)) markDone(btn); else openSheet(text); }};
  if (navigator.clipboard && navigator.clipboard.writeText) {{
    navigator.clipboard.writeText(text).then(() => markDone(btn), fallback);
  }} else {{
    fallback();
  }}
}});
</script>
"""


def main():
    if len(sys.argv) != 3:
        sys.exit("使い方: python3 make_copy_page.py plans.json out.html")
    with open(sys.argv[1], encoding="utf-8") as f:
        data = json.load(f)
    page = Page(data).render()
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(page)
    print(f"wrote {sys.argv[2]} ({len(page):,} bytes)")


if __name__ == "__main__":
    main()
