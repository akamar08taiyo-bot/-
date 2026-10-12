# 投稿キット（各話のページ）を組み立てる：概要欄の文書・サムネイル・台本・構成（timeline.json）から out/kit.html を作る
# 使い方: python3 -I build_kit.py
# - 文の元は各話の docs/youtube_*.txt（【見出し】ごとに読む）。目次の時刻は timeline.json から計算し直す
# - 動画は out/video/<話>.json（split_video.py が作る）があれば、保存ボタンと試写を付ける
import json, re, shutil
from pathlib import Path

here = Path(__file__).resolve().parent
vids = here.parent
out = here / 'out'; (out / 'thumbs').mkdir(parents=True, exist_ok=True)
CH1 = vids / 'ai-human-coexistence'; CH2 = vids / 'ai-human-coexistence-2'

EPISODES = [
    dict(id='ep1', num='第一章', title='昭和を残した2080年の海辺の町', hook='初めて見るのに、帰りたくなる場所。',
         doc=CH1 / 'docs' / 'youtube_description.txt', timeline=CH1 / 'src' / 'timeline.json', project=CH1, slug='ai_human_coexistence', thumbs=('ch1_A', 'ch1_B'),
         script=(CH1 / 'docs' / 'theme.md', '台本・構成（テーマ設定書）', 'AIと人間の共存_第一章_台本.md',
                 '世界設定、構成表、音の設計まで。シリーズの決まり（共存の約束・町の決まり）もここにあります。'),
         link=dict(placeholder='（第二章を公開したら、URLを貼る）', label='第二章の URL'),
         after=['第二章を公開したら、上の欄に第二章の URL を入れて概要欄をコピーし直し、YouTube Studio で差しかえる', '終了画面に第二章を置く（公開後）']),
    dict(id='ep2', num='第二章', title='砂の向こうから来た男', hook='どこにもないのに、知っている景色。',
         doc=CH1 / 'docs' / 'youtube_ch2.txt', timeline=CH2 / 'src' / 'timeline.json', project=CH2, slug='ai_human_coexistence_2', thumbs=('ch2_A', 'ch2_B'),
         script=(CH1 / 'docs' / 'chapter2_script.md', '台本（第8版）', 'AIと人間の共存_第二章_台本.md',
                 '見る人が推察する手がかり、画面では語らない裏設定、構成表、制作で決めたこと。'),
         link=dict(placeholder='（第一章の動画のURLを貼る）', label='第一章の URL'),
         after=['第一章の概要欄の「第二章はこちら」にも、この動画の URL を入れて差しかえる（第一章のページの欄に入れるとコピーできます）', '終了画面に第一章（第三章を公開したら第三章）を置く']),
]


def sections(text):
    # 【見出し】で区切った節 → {見出し: 本文}
    out_, key, buf = {}, None, []
    for line in text.split('\n'):
        m = re.match(r'^【(.+?)】\s*$', line)
        if m:
            if key: out_[key] = '\n'.join(buf).strip('\n')
            key, buf = m.group(1), []
        else:
            buf.append(line)
    if key: out_[key] = '\n'.join(buf).strip('\n')
    return out_


def chapters(timeline, desc):
    # 概要欄の目次の名前（「一　夜明け」など）はそのままに、時刻だけ timeline.json から計算し直す
    T = json.loads(timeline.read_text(encoding='utf-8')); XF = T['crossfade']; s = 0.0; first = {}
    for sh in T['shots']:
        first.setdefault(sh['chapter'], s); s += sh['dur'] - XF
    total = s + XF
    names = re.findall(r'^\d\d:\d\d (.+)$', desc, flags=re.M)
    rows = []
    for name in names:
        key = name.split('　')[0]
        key = {'次回予告': '予告'}.get(key, key)
        t = first[key]
        rows.append((f'{int(t // 60):02d}:{int(t % 60):02d}', name))
    return rows, total


def fix_toc(desc, rows):
    lines = [f'{t} {n}' for t, n in rows]
    return re.sub(r'(?:^\d\d:\d\d .+\n?)+', '\n'.join(lines) + '\n', desc, count=1, flags=re.M)


kit = dict(series='AIと人間の共存', lead='一話ごとに、YouTube に載せるものを一か所にまとめました。動画・タイトル・概要欄・サムネイル・タグ・台本を、上から順にコピーや保存をしていけば投稿できます。', episodes=[])
for E in EPISODES:
    S = sections(E['doc'].read_text(encoding='utf-8'))
    desc = S['概要欄（YouTube Studio の「説明」欄に貼る）']
    rows, total = chapters(E['timeline'], desc)
    desc = fix_toc(desc, rows)
    # 環境音のみ版：文書の指示どおり、2行を足してハッシュタグを替える
    asmr = desc.replace('僕の大好きなあの頃は、そのままに。\n', '僕の大好きなあの頃は、そのままに。\n\nこの動画は、テーマ曲を入れずに、町の音だけで仕上げた版です。\n作業のおともに、眠る前のひとときに、どうぞ。\n', 1)
    asmr = re.sub(r'^#AIと人間の共存 .*$', '#AIと人間の共存 #環境音 #作業用', asmr, count=1, flags=re.M)
    assert asmr != desc and '#環境音' in asmr
    thumbs = []
    notes = {m.group(1): m.group(2) for m in re.finditer(r'^([AB])(?:（おすすめ）)?：\S+\s+(.+)$', S['サムネイル'], flags=re.M)}
    for i, name in enumerate(E['thumbs']):
        shutil.copy2(CH1 / 'thumbnails' / f'{name}.jpg', out / 'thumbs' / f'{name}.jpg')
        key = name[-1]
        thumbs.append(dict(key=key, file=f'thumbs/{name}.jpg', rec=i == 0, note=notes.get(key, '')))
    settings = [l.lstrip('・').strip() for l in S['アップロード時の設定'].split('\n') if l.strip()]
    pick = lambda pat: [x for x in settings if re.search(pat, x)]
    groups = dict(audience=pick('再生リスト|視聴者'), details=pick('改変|合成'), cautions=pick('入れない|文字まで'),
                  after=E['after'] + pick('チャプター'))
    m, s_ = divmod(int(total), 60)  # YouTube と同じく切り捨て
    sp, sname, sfile, snote = E['script']
    ep = dict(id=E['id'], num=E['num'], title=E['title'], hook=E['hook'], duration=f'{m}:{s_:02d}',
              versions=dict(
                  theme=dict(label='テーマ曲入り', title=S['タイトル（テーマ曲入り版）'].strip(), description=desc,
                             note='町の音に、オリジナルのテーマ曲を重ねた版（-14 LUFS）。'),
                  asmr=dict(label='環境音のみ', title=S['タイトル（環境音のみ版）'].strip(), description=asmr,
                            note='曲を入れず、町の音と遠くの話し声・笑い声だけで仕上げた版（-16 LUFS）。作業用・睡眠用に。')),
              altTitle=S['タイトルの別案（スマホで最初に見える所に、この章だけのひと言を置く案）'].strip(),
              thumbs=thumbs, tags=S['タグ（YouTube Studio の「タグ」欄）'].strip(),
              short=S['説明（固定コメント・コミュニティ投稿・SNS 用の短い紹介文）'].strip(),
              settings=groups, chapters=rows, link=E['link'],
              script=dict(name=sname, file=sfile, note=snote, text=sp.read_text(encoding='utf-8')),
              video=None)
    vj = out / 'video' / f"{E['id']}.json"
    if vj.exists():
        v = json.loads(vj.read_text(encoding='utf-8'))
        v['note'] = ('保存すると、YouTube にそのまま上げられる MP4（H.264・AAC、元の画質のまま）になります。'
                     '約500MB を読み込むので、パソコンのブラウザがおすすめです。'
                     'Android の Claude アプリは200MB を超えるファイルを保存できないため、ブラウザで開いてください。')
        ep['video'] = v
    # 試写（480p）：各話の out/mini_<版>_480p.mp4 を 14MB ずつに分けて out/preview/ へ（ページのファイルとして載せる）
    pdir = out / 'preview'; pdir.mkdir(exist_ok=True)
    ep['preview'] = {}
    for ver in ('theme', 'asmr'):
        mini = E['project'] / 'out' / f'mini_{ver}_480p.mp4'
        master = E['project'] / 'out' / f"{E['slug']}_{ver}.mp4"
        if not mini.exists() or mini.stat().st_mtime < master.stat().st_mtime:  # 本編より古い試写（前の版）は載せない
            continue
        data = mini.read_bytes(); parts = []
        for k in range(0, len(data), 14_000_000):
            name = f"{E['id']}_{ver}_{k // 14_000_000}.mp4"
            (pdir / name).write_bytes(data[k:k + 14_000_000])
            parts.append(dict(path=f'preview/{name}', size=len(data[k:k + 14_000_000])))
        ep['preview'][ver] = dict(parts=parts, size=len(data))
    kit['episodes'].append(ep)

data = json.dumps(kit, ensure_ascii=False).replace('</', '<\\/')  # <script> の中で閉じタグにならないように
html = (here / 'kit_template.html').read_text(encoding='utf-8').replace('/*KIT_DATA*/', data)
(out / 'kit.html').write_text(html, encoding='utf-8')
print('out/kit.html', len(html.encode()) // 1024, 'KB;', [(e['num'], e['duration'], len(e['chapters']), bool(e['video'])) for e in kit['episodes']])
