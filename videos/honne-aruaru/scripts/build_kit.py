#!/usr/bin/env python3
"""投稿キット：完成した回を「動画・サムネ・タイトル・説明文・タグ・固定コメント」の1セットずつ並べたページを作る。

  python3 -I scripts/build_kit.py   → kit/index.html と kit/thumb/・kit/thumb_s/・kit/chars.jpg、work/kit/<回>.mp4

中身は out/<回>_概要欄.txt（【タイトル】【概要欄】【タグ欄】【固定コメント】）と kit/kit.json（回の並び・ひと言・どんな回？）。
動画は Artifact の assets に上げる（1本 20 MiB まで。work/kit/<回>.mp4 は out/<回>.mp4 を少し軽くした版）。
返ってきた id を kit/kit.json の "vid" に書き、もう一度このスクリプトを通してから公開し直す。
"""
import html, json, os, subprocess, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import ROOT

KIT = os.path.join(ROOT, 'kit')
WORK = os.path.join(ROOT, 'work', 'kit')
OUT = os.path.join(ROOT, 'out')
LIMIT = int(20 * 1048576 * 0.95)  # assets の上限 20 MiB に余裕をもたせる
C = json.load(open(os.path.join(KIT, 'kit.json'), encoding='utf-8'))
esc = html.escape


def sections(path):
    """概要欄の txt を【見出し】ごとに分ける"""
    out, cur = {}, None
    for line in open(path, encoding='utf-8').read().splitlines():
        if line.startswith('【') and line.endswith('】'):
            cur = line[1:-1]
            out[cur] = []
        elif cur:
            out[cur].append(line)
    return {k: '\n'.join(v).strip() for k, v in out.items()}


def kit_video(key):
    """assets に入る大きさの動画（元の動画の映像だけを圧縮し直し、音はそのまま）"""
    src = os.path.join(OUT, f'{key}.mp4')
    dst = os.path.join(WORK, f'{key}.mp4')
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return dst
    os.makedirs(WORK, exist_ok=True)
    master = os.path.join(ROOT, 'work', key, 'video_silent.mp4')  # あれば画質の高い元の映像から
    for crf in (24, 26, 28):
        ins = ['-i', master, '-i', src, '-map', '0:v', '-map', '1:a'] if os.path.exists(master) else ['-i', src, '-map', '0:v', '-map', '0:a']
        subprocess.run(['ffmpeg', '-y', '-v', 'error', *ins, '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation',
                        '-crf', str(crf), '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', dst], check=True)
        if os.path.getsize(dst) <= LIMIT:
            return dst
    sys.exit(f'{dst} が 20 MiB に収まりません')


def images(key):
    im = Image.open(os.path.join(OUT, f'{key}_cover.png')).convert('RGB')
    for d, w, q in (('thumb', 1080, 90), ('thumb_s', 270, 85)):
        os.makedirs(os.path.join(KIT, d), exist_ok=True)
        im.resize((w, w * im.height // im.width), Image.LANCZOS).save(os.path.join(KIT, d, f'{key}.jpg'), quality=q)


eps = []
for i, e in enumerate(C['episodes'], 1):
    s = sections(os.path.join(OUT, f"{e['key']}_概要欄.txt"))
    titles = [t for t in s['タイトル（どれか1つ）'].splitlines() if t.strip()]
    total = json.load(open(os.path.join(ROOT, 'episodes', e['key'], 'timeline.json')))['total']
    v = kit_video(e['key'])
    images(e['key'])
    eps.append(dict(e, n=i, titles=titles, desc=s['概要欄'], tags=s['タグ欄'], pin=s['固定コメント'],
                    sec=round(total), mb=os.path.getsize(v) / 1048576))
    print(e['key'], f'{round(total)}秒', f'{os.path.getsize(v) / 1048576:.1f} MiB', 'vid=' + (e['vid'] or '（まだ）'))
ch = Image.open(os.path.join(OUT, 'honne_characters.png')).convert('RGB')
ch.resize((1600, 1600 * ch.height // ch.width), Image.LANCZOS).save(os.path.join(KIT, 'chars.jpg'), quality=86)


def card(e):
    k, n = e['key'], e['n']
    alt = ''.join(f'<li><span id="t{j}-{k}">{esc(t)}</span><button type="button" class="btn copy" data-copy="t{j}-{k}">コピー</button></li>'
                  for j, t in enumerate(e['titles'][1:], 2))
    vid = esc(e['vid'])
    play = (f'<video controls playsinline preload="none" poster="thumb_s/{k}.jpg" data-src="/_blob/{vid}"></video>' if vid
            else '<p class="intro">動画は準備中です。</p>')
    return f'''<article class="vc" id="v-{k}" data-key="{k}" data-vid="{vid}">
  <span class="posted" hidden>投稿済</span>
  <div class="vh"><span class="no">{n}</span><span class="series">{esc(e['series'])}</span><span class="dur">{e['sec']}秒</span></div>
  <p class="when">{esc(e['when'])}</p>
  <div class="vb">
    <img class="th" src="thumb_s/{k}.jpg" alt="サムネ：{esc(e['titles'][0])}" width="135" height="240" loading="lazy">
    <div class="vm">
      <p class="lbl">タイトル（おすすめ）<span class="count">{len(e['titles'][0])}字</span></p>
      <h3 class="vt" id="t-{k}">{esc(e['titles'][0])}</h3>
      <div class="btns">
        <button type="button" class="btn save" data-act="video"{'' if vid else ' disabled'}>動画を保存</button>
        <button type="button" class="btn save" data-act="thumb">サムネを保存</button>
        <button type="button" class="btn copy" data-copy="t-{k}">タイトルをコピー</button>
        <button type="button" class="btn copy" data-copy="d-{k}">説明文をコピー</button>
        <button type="button" class="btn copy" data-copy="g-{k}">タグをコピー</button>
        <button type="button" class="btn copy" data-copy="p-{k}">固定コメントをコピー</button>
      </div>
      <label class="done"><input type="checkbox" id="done-{k}"> 投稿した</label>
    </div>
  </div>
  <details class="play"><summary>動画を見る</summary>{play}</details>
  <details><summary>ほかのタイトル案（{len(e['titles']) - 1}つ）</summary><ul class="alt">{alt}</ul></details>
  <details><summary>説明文を見る</summary><pre id="d-{k}">{esc(e['desc'])}</pre></details>
  <details><summary>タグを見る</summary><pre id="g-{k}">{esc(e['tags'])}</pre><p class="count">YouTube Studio の動画の詳細 →「タグ」に貼ります（, で区切られて1つずつのタグになります）。</p></details>
  <details><summary>固定コメントを見る</summary><pre id="p-{k}">{esc(e['pin'])}</pre></details>
  <details><summary>どんな回？</summary><p class="intro">{esc(e['about'])}（尺：{e['sec']}秒。サムネにするコマ：最初から約{e['cover_t']:g}秒）</p></details>
</article>'''


chars = ''.join(f'<tr><th scope="row">{esc(a)}</th><td>{esc(b)}</td><td>{esc(c)}</td></tr>' for a, b, c in C['characters'])
N = len(eps)
page = f'''<title>しのぶの失言ノート投稿キット</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Yusei+Magic&family=Zen+Maru+Gothic:wght@500;700;900&display=swap">
<style>
/* 配置：黒い「失言ノート」の表紙 →「動画（投稿の順番）」→「投稿の流れ」→「投稿のときの設定」→「登場人物」。スマホは一列、広い画面は動画を2列 */
:root{{
  --bg:#F2EFF3; --surface:#FFFFFF; --ink:#2A2230; --ink2:#655A6A; --line:#E0D8E1; --soft:#F7F4F7;
  --pink:#C2335B; --pink-bg:#FBE6EC; --navy:#26385F; --on-navy:#FFFFFF; --stamp:#C3302C; --check:#9A6A06;
  --cover:#221C26; --cover-band:#17121A; --on-cover:#F6F1F6; --on-cover2:#C9BECC; --cover-accent:#E9B949; --cover-stamp:#FF7A70;
  --f-display:"Dela Gothic One","Hiragino Sans","Noto Sans JP",sans-serif;
  --f-body:"Zen Maru Gothic","Hiragino Maru Gothic ProN","Hiragino Sans","Noto Sans JP",sans-serif;
  --f-hand:"Yusei Magic","Hiragino Maru Gothic ProN","Hiragino Sans","Noto Sans JP",sans-serif;
}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{
  --bg:#141117; --surface:#1F1A23; --ink:#F1EBF2; --ink2:#B5AAB9; --line:#352D3A; --soft:#19151C;
  --pink:#F27E9E; --pink-bg:#3A1C27; --navy:#AFC2F2; --on-navy:#141117; --stamp:#F2716B; --check:#E5B84E;
  --cover:#2A232F; --cover-band:#1D1821; --on-cover:#F6F1F6; --on-cover2:#C9BECC; --cover-accent:#E9B949; --cover-stamp:#FF7A70; color-scheme:dark}}}}
:root[data-theme="dark"]{{
  --bg:#141117; --surface:#1F1A23; --ink:#F1EBF2; --ink2:#B5AAB9; --line:#352D3A; --soft:#19151C;
  --pink:#F27E9E; --pink-bg:#3A1C27; --navy:#AFC2F2; --on-navy:#141117; --stamp:#F2716B; --check:#E5B84E;
  --cover:#2A232F; --cover-band:#1D1821; --on-cover:#F6F1F6; --on-cover2:#C9BECC; --cover-accent:#E9B949; --cover-stamp:#FF7A70; color-scheme:dark}}
*{{box-sizing:border-box}}
body{{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-weight:500;font-size:15px;line-height:1.75}}
.wrap{{max-width:1040px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:24px 72px;display:flex;flex-direction:column;gap:32px}}
h1,h2,h3{{margin:0;text-wrap:balance}}
h2{{font-family:var(--f-display);font-weight:400;font-size:clamp(20px,4.4vw,25px);line-height:1.35}}
h3{{font-size:15.5px;font-weight:900;line-height:1.55}}
.top{{display:flex;flex-direction:column;gap:12px}}
.cover{{position:relative;overflow:hidden;background:var(--cover);color:var(--on-cover);border-radius:6px 16px 16px 6px;padding:22px 22px 24px 40px;display:flex;flex-direction:column;gap:6px}}
.cover::before{{content:"";position:absolute;left:0;top:0;bottom:0;width:16px;background:var(--cover-band)}}
.eyebrow{{margin:0;font-size:12.5px;font-weight:700;letter-spacing:.14em;color:var(--cover-accent)}}
h1{{font-family:var(--f-display);font-weight:400;font-size:clamp(30px,7.4vw,46px);line-height:1.15;letter-spacing:.02em}}
.hand{{margin:0;font-family:var(--f-hand);font-size:18px;color:var(--on-cover2)}}
.cover .stamp{{position:absolute;right:20px;bottom:18px;transform:rotate(-9deg);border:3px solid var(--cover-stamp);color:var(--cover-stamp);font-family:var(--f-display);font-size:18px;line-height:1;padding:6px 9px 5px;border-radius:6px}}
.lead{{margin:0;color:var(--ink2);max-width:44em}}
.nav{{display:flex;flex-wrap:wrap;gap:8px}}
.nav a{{font-size:13px;font-weight:700;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:99px;padding:5px 14px}}
.nav a:hover,.nav a:focus-visible{{border-color:var(--pink);outline:none}}
section{{display:flex;flex-direction:column;gap:14px;scroll-margin-top:12px}}
.sec-lead{{margin:0;color:var(--ink2);font-size:14px;max-width:46em}}
.progress{{font-weight:900;font-size:15px;font-variant-numeric:tabular-nums}}
.cards{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}}
.vc{{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;min-width:0}}
.vc.is-done .vb{{opacity:.7}}
.posted{{position:absolute;right:14px;top:12px;transform:rotate(-10deg);border:2.5px solid var(--stamp);color:var(--stamp);font-family:var(--f-display);font-size:15px;line-height:1;padding:5px 8px 4px;border-radius:5px}}
.vh{{display:flex;align-items:center;gap:8px;flex-wrap:wrap}}
.no{{font-family:var(--f-display);font-size:15px;min-width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--pink-bg);color:var(--pink);border:2px solid var(--pink)}}
.series{{font-size:12.5px;font-weight:900;color:var(--pink);background:var(--pink-bg);border-radius:99px;padding:2px 11px;white-space:nowrap}}
.dur{{font-size:12.5px;color:var(--ink2);font-variant-numeric:tabular-nums}}
.when{{margin:0;font-size:13px;font-weight:700;color:var(--ink2)}}
.vb{{display:flex;gap:12px;align-items:flex-start}}
.th{{flex:none;width:112px;height:auto;aspect-ratio:9/16;border-radius:8px;border:1px solid var(--line);object-fit:cover;max-width:100%}}
.vm{{min-width:0;display:flex;flex-direction:column;gap:8px}}
.lbl{{margin:0;font-size:12px;font-weight:700;color:var(--ink2);display:flex;gap:8px;align-items:baseline}}
.vt{{overflow-wrap:anywhere}}
.btns{{display:flex;flex-wrap:wrap;gap:6px}}
.btn{{font:inherit;font-size:12.5px;font-weight:700;border-radius:99px;padding:5px 11px;cursor:pointer;border:1px solid var(--navy);background:var(--surface);color:var(--ink);line-height:1.4}}
.btn.save{{background:var(--navy);color:var(--on-navy)}}
.btn:disabled{{opacity:.45;cursor:default}}
.btn:focus-visible,.nav a:focus-visible,summary:focus-visible,.done input:focus-visible{{outline:3px solid var(--pink);outline-offset:2px}}
.done{{font-size:13.5px;font-weight:700;display:flex;align-items:center;gap:6px;cursor:pointer}}
.done input{{width:18px;height:18px;accent-color:var(--stamp)}}
details{{border-top:1px solid var(--line);padding-top:8px}}
summary{{cursor:pointer;font-size:13.5px;font-weight:700;color:var(--ink2)}}
details pre,details .alt,details video{{margin-top:8px}}
pre{{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--f-body);font-weight:500;font-size:13.5px;line-height:1.8;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:12px 14px}}
ul.alt{{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}}
ul.alt li{{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:8px 10px 8px 12px;font-size:14px;font-weight:700}}
ul.alt li span{{min-width:0;overflow-wrap:anywhere}}
ul.alt .btn{{flex:none}}
p.intro{{margin:8px 0 0;font-size:13.5px;color:var(--ink2)}}
.count{{color:var(--ink2);font-size:12px;font-weight:500;font-variant-numeric:tabular-nums}}
details > .count{{margin:6px 0 0}}
video{{display:block;width:100%;max-width:270px;aspect-ratio:9/16;border-radius:10px;background:var(--cover)}}
ol.flow{{margin:0;padding:0;list-style:none;counter-reset:f;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:10px}}
ol.flow li{{counter-increment:f;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px 12px 52px;position:relative;font-size:14px;min-width:0}}
ol.flow li::before{{content:counter(f);position:absolute;left:14px;top:12px;width:26px;height:26px;border-radius:50%;background:var(--navy);color:var(--on-navy);font-weight:900;font-size:14px;display:grid;place-items:center}}
ol.flow b{{display:block}}
.card{{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0}}
ul.check{{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}}
ul.check li{{padding-left:28px;position:relative;font-size:14px}}
ul.check li::before{{content:"";position:absolute;left:2px;top:5px;width:16px;height:16px;border:2px solid var(--check);border-radius:4px}}
.chars-img{{width:100%;height:auto;border-radius:10px;border:1px solid var(--line);max-width:100%}}
.tbl{{overflow-x:auto}}
table{{border-collapse:collapse;width:100%;min-width:520px;font-size:14px}}
th,td{{text-align:left;vertical-align:top;padding:8px 10px;border-bottom:1px dashed var(--line)}}
thead th{{font-size:12.5px;color:var(--ink2);border-bottom:1px solid var(--line)}}
tbody th{{white-space:nowrap;font-weight:900}}
tr:last-child th,tr:last-child td{{border-bottom:0}}
.row{{display:flex;flex-wrap:wrap;gap:8px;align-items:center}}
.row a{{font-size:13px;font-weight:700;color:var(--pink)}}
.toast{{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);background:var(--navy);color:var(--on-navy);padding:10px 18px;border-radius:99px;font-size:14px;font-weight:700;max-width:calc(100% - 32px);text-align:center;z-index:10}}
@media (max-width:860px){{.cards{{grid-template-columns:minmax(0,1fr)}}}}
@media (max-width:520px){{.th{{width:96px}}.cover{{padding-left:34px}}.cover::before{{width:12px}}}}
@media (prefers-reduced-motion:reduce){{*{{scroll-behavior:auto}}}}
</style>

<div class="wrap">
<header class="top">
  <div class="cover">
    <p class="eyebrow">投稿キット</p>
    <h1>しのぶの失言ノート</h1>
    <p class="hand">はい、記録しました。</p>
    <span class="stamp" aria-hidden="true">記録</span>
  </div>
  <p class="lead">完成した{N}本を、「動画・サムネ・タイトル・説明文・タグ・固定コメント」の1セットずつにまとめました。上から順に、スマホだけで投稿できます。</p>
  <nav class="nav" aria-label="ページの中"><a href="#videos">動画{N}本</a><a href="#flow">投稿の流れ</a><a href="#settings">投稿のときの設定</a><a href="#chars">登場人物</a></nav>
</header>

<section id="videos">
  <h2>動画{N}本（投稿の順番）</h2>
  <p class="sec-lead">番号は投稿する順番です。同じ日に2本出さず、数日あけて反応を比べます。保存される動画は、元の動画を少し軽くした版です（見た目はほとんど変わりません）。</p>
  <div class="row"><span class="progress" id="prog">投稿済み 0 / {N}</span></div>
  <div class="cards" id="cards">
{chr(10).join(card(e) for e in eps)}
  </div>
</section>

<section id="flow">
  <h2>投稿の流れ（1本ぶん）</h2>
  <ol class="flow">
    <li><b>動画を保存</b>上の「動画を保存」で、スマホに保存します。</li>
    <li><b>YouTubeアプリでアップロード</b>「＋」から保存した動画を選びます。縦で1分以内なので、ショートになります。</li>
    <li><b>タイトルと説明文を貼る</b>「タイトルをコピー」「説明文をコピー」で貼りつけます。タグは、YouTube Studio の動画の詳細の「タグ」に貼ります（アプリの投稿画面にタグ欄がないときは、投稿のあとで）。</li>
    <li><b>設定して公開</b>下の「投稿のときの設定」のとおりにして、公開（または予約）します。</li>
    <li><b>サムネを選び直す（投稿のあと）</b>YouTube アプリで：右下「マイページ」→「動画」→ その動画の「︙」→「編集」→ サムネのえんぴつ → コマを、題字がそろうところ（各回の「どんな回？」に書いた秒数）に合わせて「完了」→「保存」。</li>
    <li><b>固定コメント</b>「固定コメントをコピー」でコメントに貼り、そのコメントの「︙」→「固定」。</li>
    <li><b>「投稿した」にチェック</b>このスマホに記録され、カードに「投稿済」のはんこが付きます。</li>
  </ol>
</section>

<section id="settings">
  <h2>投稿のときの設定</h2>
  <div class="card">
    <ul class="check">
      <li>公開範囲：公開（または日時を決めて予約）</li>
      <li>視聴者：子ども向けではない</li>
      <li>改変または合成されたコンテンツ：「はい」（ナレーションが AI で作った声のため。申告しても表示回数には影響しません）</li>
      <li>カテゴリ：エンターテイメント</li>
      <li>コメント：オン。固定コメントを付ける</li>
      <li>2本は同じ日に出さず、数日あける</li>
      <li>投稿のあとに見る数字：「視聴を選んだ割合」と「平均再生率」。コメントで多かった失言は、次の回の台本の候補にする</li>
    </ul>
  </div>
</section>

<section id="chars">
  <h2>登場人物</h2>
  <p class="sec-lead">#2 から、4人に名前があります。Tシャツやキーホルダーを作るときも、この見た目と目印に合わせます。</p>
  <div class="card">
    <img class="chars-img" src="chars.jpg" alt="登場人物：しのぶ、まもる、よしえ、みなと、赤ちゃんの全身" width="1600" height="{1600 * ch.height // ch.width}" loading="lazy">
    <div class="tbl"><table><thead><tr><th scope="col">名前</th><th scope="col">立場</th><th scope="col">目印</th></tr></thead><tbody>{chars}</tbody></table></div>
    <div class="row"><button type="button" class="btn save" data-file="chars.jpg" data-name="shinobu_characters.jpg">キャラ一覧を保存</button><a href="{esc(C['doc'])}" target="_blank" rel="noopener">キャラクター設定書を開く</a></div>
  </div>
</section>
</div>
<div class="toast" id="toast" hidden></div>

<script>
(function(){{
  var N={N};
  var toastT; function toast(m){{var t=document.getElementById('toast');t.textContent=m;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){{t.hidden=true}},2600)}}
  // コピー
  document.addEventListener('click',function(ev){{
    var b=ev.target.closest('[data-copy]'); if(!b) return;
    var el=document.getElementById(b.dataset.copy); var text=el.textContent;
    var done=function(){{toast('コピーしました')}};
    var fail=function(){{var d=el.closest('details'); if(d) d.open=true; var r=document.createRange();r.selectNodeContents(el);var s=getSelection();s.removeAllRanges();s.addRange(r); toast('選びました。長押しでコピーしてください')}};
    try{{navigator.clipboard.writeText(text).then(done,fail)}}catch(e){{fail()}}
  }});
  // 保存（downloads）
  var dlP=null; function dl(){{ if(!dlP) dlP=(window.claude&&window.claude.use)?window.claude.use('downloads').catch(function(){{return null}}):Promise.resolve(null); return dlP }}
  async function save(url,name,btn){{
    var api=await dl(); if(!api){{toast('保存は、Claude のアプリかブラウザでこのページを開くと使えます');return}}
    var old=btn.textContent; btn.disabled=true; btn.textContent='読み込み中…';
    try{{ var r=await fetch(url); if(!r.ok) throw {{code:'fetch'}}; var blob=await r.blob();
      btn.textContent='保存の確認中…'; await api.save({{filename:name,data:blob}}); toast('保存しました');
    }}catch(e){{ var c=e&&e.code; if(c==='declined') toast('保存をやめました'); else if(c==='rate_limited') toast('少し待ってから、もう一度押してください'); else toast('保存できませんでした（'+(c||'エラー')+'）'); }}
    finally{{ btn.disabled=false; btn.textContent=old; }}
  }}
  document.addEventListener('click',function(ev){{
    var b=ev.target.closest('.btn.save'); if(!b||b.disabled) return;
    if(b.dataset.file){{ save(b.dataset.file,b.dataset.name,b); return }}
    var c=b.closest('.vc'); var k=c.dataset.key;
    if(b.dataset.act==='thumb') save('thumb/'+k+'.jpg',k+'_thumb.jpg',b);
    if(b.dataset.act==='video'&&c.dataset.vid) save('/_blob/'+c.dataset.vid,k+'.mp4',b);
  }});
  // 動画を見る（開いたときだけ読み込む）
  document.querySelectorAll('details.play').forEach(function(d){{d.addEventListener('toggle',function(){{var v=d.querySelector('video'); if(d.open&&v&&!v.getAttribute('src')) v.src=v.dataset.src}})}});
  // 投稿した（このスマホに記録）
  var KEY='shinobu-kit-done-v1', state={{}}; try{{state=JSON.parse(localStorage.getItem(KEY)||'{{}}')||{{}}}}catch(e){{}}
  function paint(){{var n=0; document.querySelectorAll('.vc').forEach(function(c){{var on=!!state[c.dataset.key]; c.classList.toggle('is-done',on); c.querySelector('.posted').hidden=!on; c.querySelector('.done input').checked=on; if(on) n++}}); document.getElementById('prog').textContent='投稿済み '+n+' / '+N}}
  document.addEventListener('change',function(ev){{var i=ev.target.closest('.done input'); if(!i) return; var k=i.closest('.vc').dataset.key; if(i.checked) state[k]=1; else delete state[k]; try{{localStorage.setItem(KEY,JSON.stringify(state))}}catch(e){{}} paint()}});
  paint();
}})();
</script>
'''
open(os.path.join(KIT, 'index.html'), 'w', encoding='utf-8').write(page)
print('kit/index.html', f'{len(page.encode()) / 1024:.0f} KB')
