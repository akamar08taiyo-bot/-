# 第二章 v10 の構成表（src/timeline.json）を作る。v9（work/v9/timeline.json）の音・文字の設定を引き継ぎ、
# 作者の方針（2026年10月）で組み直す：「帰郷と振り返り」を軸に、町の場面は崩れない数秒と止め絵で少しだけ残す。
# 動きは Veo の元の速さ（人・手は等速、灯りや景色だけ 1.25〜1.5 倍まで）。足りない所は原画の止め絵（差し込み・思い出の写真）
# 使い方: python3 -I scripts/timeline_v10.py   → src/timeline.json を書き、全体の尺と章の頭の時刻を表示
import copy, json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
V9 = {s['id']: s for s in json.loads((root / 'work' / 'v9' / 'timeline.json').read_text(encoding='utf-8'))['shots']}
base = json.loads((root / 'work' / 'v9' / 'timeline.json').read_text(encoding='utf-8'))


def cap(t0, t1, text):
    return {'t0': t0, 't1': t1, 'text': text}


def card(t0, t1, num, title, time, **kw):
    return dict(t0=t0, t1=t1, num=num, title=title, time=time, **kw)


def shot(sid, chapter, name, dur, clip=None, **kw):
    s = {'id': sid, 'chapter': chapter, 'name': name, 'dur': dur, 'clip': clip if clip is not None else dur}
    s.update(kw)
    return s


def audio(src, **over):
    a = copy.deepcopy(V9[src].get('audio', {})) if src in V9 else {}
    a.update(over)
    return a


def still_audio(beds, gain=0):
    return {'veo': 0.0, 'bed_gain': gain, 'beds': beds}


# --- 焼き込み（v9 の設定を、元の速さのクリップの時刻に直したもの） ---
A2_INK = copy.deepcopy(V9['A2']['ink'])
for ink in A2_INK:  # v9 は 2倍（元の秒 = v9 の秒 / 2）。新しいクリップは元の 0 秒から
    ink['t0'] = 0.0; ink['fin'] = 0.0; ink['t1'] = 9.0  # 最初のコマからカードの字がある（寄りの止め絵 A2s はこのクリップの 0.3 秒から切り抜く）
    ink['occlude']['refs'] = [{'until': 2.49, 'ref': [0.79, 0.99, 1.19]}, {'ref': [5.19, 5.39, 5.59, 5.79]}]
    ink['patch']['ref'] = [5.19, 5.39, 5.59, 5.79]
    for it in ink['items']:
        if it.get('kind') == 'stamp' and it.get('t', -1) > 0: it['t'] = 3.72
C5_INK = copy.deepcopy(V9['C5']['ink'])
C5_INK[0]['items'].append({'text': 'きょうも、だれも\nこなかった。', 'x': 0.12, 'y': 0.15, 'size': 0.042, 'font': 'robot', 'line': 1.5,
                           'color': '#3a3f47', 'opacity': 0.7, 'spacing': 0.1})
C6_INK = copy.deepcopy(V9['C6']['ink'])
for ink in C6_INK:  # きれいな柱の基準：手が離れた元 7.79〜7.89 秒（クリップは 0〜8 秒を焼き、見せるのは 7 秒まで）
    ink['occlude']['ref'] = [7.79, 7.89]; ink['patch']['ref'] = [7.79, 7.89]
R3_INK = copy.deepcopy(V9['R3']['ink'])
D1_INK = copy.deepcopy(V9['D1']['ink'])
E3_INK = copy.deepcopy(V9['E3']['ink'])
for ink in E3_INK:  # 紙が開き切る元 5.3 秒（新しいクリップの 1.9 秒）から、はじめから書いてあったように出す
    ink['t0'] = 1.9; ink['fin'] = 0.12; ink['occlude']['ref'] = [3.35, 3.85, 4.35]
# 日記（C4 の原画の止め絵に焼く）。左のページの四隅（原画の割合）
C4_L = [0.417, 0.259, 0.515, 0.368, 0.344, 0.703, 0.229, 0.608]
C4_R = [0.515, 0.368, 0.682, 0.472, 0.500, 0.810, 0.344, 0.703]


def crop_quad(q, x0, y0, x1, iw=2752, ih=1536):  # 原画の四隅を、切り抜いた止め絵の座標に直す（make_still.py の --crop と同じ切り方）
    w = x1 - x0; h = w * iw / ih * 9 / 16
    return [round((q[i] - x0) / w, 4) if i % 2 == 0 else round((q[i] - y0) / h, 4) for i in range(8)]


KIDS_1986 = [  # 1986年8月24日：子どもふたりの字（女の子は丸い字、男の子は鉛筆）
    {'text': '1986.8.24　はれ', 'x': 0.1, 'y': 0.07, 'size': 0.05, 'font': 'maru', 'color': '#3d3a46', 'opacity': 0.8},
    {'text': 'らいねんも　いっしょに\nはなび　みようね。', 'x': 0.1, 'y': 0.17, 'size': 0.058, 'font': 'maru', 'line': 1.55, 'color': '#3d3a46', 'opacity': 0.82},
    {'text': 'うん。やくそく。', 'x': 0.12, 'y': 0.4, 'size': 0.06, 'font': 'pencil', 'color': '#3b3b42', 'opacity': 0.78, 'rot': -2},
]
YEARS = [('1987', 0.0), ('1993', 0.04), ('2001', 0.1), ('2012', 0.2), ('2024', 0.32), ('2033', 0.45)]
WOMAN_YEARS = [{'text': f'{y}.8.24　来年も、いっしょに見ようね。', 'x': 0.08, 'y': 0.07 + i * 0.105, 'size': 0.04, 'font': 'pen',
                'color': '#2f3340', 'opacity': 0.8, 'shaky': sh} for i, (y, sh) in enumerate(YEARS)]

S = []
# ---------------- 序 ----------------
S.append({'id': 'H0', 'chapter': '序', 'name': '冒頭のつかみ（帰郷の一日から、四つの場面を少しずつ）', 'dur': 16.0, 'clip': 16.0,
          'hook': {'xf': 0.5, 'segs': [  # 元の速さのクリップから（make_hook.py で public/clips/H0.mp4 を作る）
              {'src': 'A1', 'ss': 0.6, 'len': 3.9, 'beds': [{'name': 'morning_birds', 'gain': 3}, {'name': 'distant_sea', 'gain': 2}]},
              {'src': 'C2', 'ss': 0.4, 'len': 3.9, 'beds': ['ferry_deck']},
              {'src': 'R5', 'ss': 1.0, 'len': 3.9, 'beds': ['insects'], 'events': [{'t': 1.4, 'type': 'laugh', 'kind': 'kid', 'far': True, 'seed': 31, 'gain': -3}]},
              {'src': 'D1', 'ss': 0.4, 'len': 5.8, 'beds': ['higurashi']}]},
          'captions': [cap(11.0, 14.9, 'どこにもないのに、知っている景色。')], 'veil': copy.deepcopy(V9['H0'].get('veil', []))})
S.append(shot('P0', '序', '2026年の浜（砂丘へ歩く男）', 14.0, 8.0, push=[1.0, 1.04],
              captions=[cap(1.0, 5.6, '2026年8月24日。'), cap(6.2, 11.0, 'あの島を出て、四十年。')],
              veil=[{'t0': 8.6, 't1': 14.0, 'from': 0, 'to': 0.72, 'color': '#cdbb9a'}],
              audio=audio('P0'),
              events=[{'t': 0.8, 'type': 'phone_notify'}, {'t': 3.4, 'type': 'phone_notify', 'gain': -2}, {'t': 6.0, 'type': 'phone_notify', 'gain': -5},
                      {'t': 8.6, 'type': 'phone_notify', 'gain': -9}]))
S.append(shot('P1', '序', '砂の向こう（夜の砂丘、島の灯りと花火）', 16.0, 12.0, push=[1.0, 1.035],
              veil=[{'t0': 0.0, 't1': 3.0, 'from': 0.72, 'to': 0, 'color': '#cdbb9a'}],
              title=dict(V9['P1']['title'], t0=4.2, t1=15.2), audio=audio('P1')))
# ---------------- 一　朝（2080年、町） ----------------
# 2026年10月12日、作者の希望で止め絵を Veo で動かした（A1s・B1s・B1v・B2s・B6s・B4p・C2s・E4s。natural_plan_v10.json）。
#   残高が途中で切れて Gemini で試聴できなかったので、Veo の音は使わず、合成の環境音のまま（still_audio は veo: 0 の意味で使う）
S.append(shot('A1s', '一', '夜明けの海沿いの道（走り去る軽トラ）', 6.6,
              captions=[cap(0.9, 5.8, '2080年8月25日、日曜日。')], audio=still_audio(['morning_birds', 'distant_sea'], 5),
              events=[{'t': 0.6, 'type': 'aircar_pass', 'gain': -9}]))
S.append(shot('A1', '一', '夜明けの海沿いの道（荷台の男とロボット）', 6.0, 5.2, audio=audio('A1')))
S.append(shot('A2w', '一', '浜のラジオ体操（止め絵：引き）', 6.6, push=[1.0, 1.04], audio=still_audio(['harbor_morning', 'kids_play'], 4)))
S.append(shot('A2s', '一', 'ラジオ体操のカード（寄り）', 6.2, push=[1.0, 1.04],
              captions=[cap(0.8, 5.6, '最後の日のハンコだけ、空いていた。')], audio=still_audio(['harbor_morning', 'kids_play'], 3)))
S.append(shot('A2', '一', 'ラジオ体操のカード（はんこ）', 6.8, 6.2, ink=A2_INK,
              holo=[dict(V9['A2']['holo'][0], t0=0.6)], audio=audio('A2'), events=[{'t': 1.1, 'type': 'stamp_paper'}]))
# 喫茶店：残高の補充後（2026年10月12日）、原画 B1_v6 から Veo を作り直し、止め絵2枚＋動きの3カットに（合わせた尺は前と同じ）。
#   B1_v6 は、Veo が「他社のコンテンツ」と判定したコンビニの店構えを昭和の小さな商店に、実在の通勤電車に似た電車を丸い吊り下げ式に描き直したもの。
#   前の B1v（別の原画）は女の人の顔が映り、コンビニの看板が実在のチェーンに似ていたので使わない。
#   B1 の奥の女の人は 4.5 秒から横顔になるので、頭だけ 2 秒目のコマで止めてある（scripts/freeze_region.py の頭に作り直しの手順）
#   B1s はモノレールが途中で重なって増えるので、上の部分（空・モノレール・ビル）だけ最初のコマで止めた（freeze_region.py --poly）
S.append(shot('B1s', '一', '喫茶店の窓（朝の通りとモノレール）', 5.8,
              chapterCard=card(0.9, 5.4, '一', '朝', '午前八時十分'), audio=still_audio(['cafe_room', 'town_murmur_far'], 5),
              events=[{'t': 1.8, 'type': 'cup_clink'}]))
#   B1v は、左官（B2s）を 2 秒短くした分だけ長くして、カットの頭の時刻（曲とのつながり）を変えない
S.append(shot('B1v', '一', '喫茶店のカウンター（サイフォンとモーニング）', 6.6,
              audio=still_audio(['cafe_room', 'siphon'], 6), events=[{'t': 1.6, 'type': 'cup_clink', 'gain': -3}]))
B1 = copy.deepcopy(V9['B1']); B1.pop('push', None); B1.pop('chapterCard', None)
B1.update(dur=8.4, clip=8.0, chapter='一', name='喫茶店のモーニング', captions=[cap(3.0, 7.6, '町は、今日も少しずつ新しくなる。')],
          audio={'veo': 0.6, 'bed_gain': 3, 'beds': ['cafe_room', 'siphon']},
          events=[{'t': 0.2, 'type': 'monorail_pass', 'gain': -8}, {'t': 5.8, 'type': 'cup_clink', 'gain': -4}])
B1['voice'][0]['t0'] = 1.2
S.append(B1)
#   B2s は 5.4 秒からこてが手から離れて浮くので、0〜5 秒だけ
S.append(shot('B2s', '一', '左官とロボット（こてで塗る）', 4.4,
              captions=[cap(0.6, 4.4, '壁の塗り方は、人がロボットに教える。')],
              audio=still_audio(['cicadas_far', 'workers_chat'], 4),
              events=[{'t': 1.6, 'type': 'laugh', 'kind': 'woman', 'far': False, 'soft': True, 'seed': 21}]))
S.append(shot('B2', '一', '左官とロボット', 4.6, 3.35, audio=audio('B2'), events=[]))
S.append(shot('C1', '一', '牛丼屋（止め絵）', 6.6, push=[1.0, 1.04], captions=[cap(1.2, 5.8, '牛丼は、今も早い。')],
              audio=still_audio(['town_murmur_far', 'shop_voices'], 5)))
S.append(shot('B6s', '一', '路地の将棋（盤と手元）', 6.4,
              captions=[cap(1.0, 5.8, '将棋のロボットは、ときどき負けてくれる。')],
              audio=still_audio(['cicadas_far', 'kids_play'], 4)))
S.append(shot('B6', '一', '路地の将棋（めんこを拾う子、駒を指すロボットの手）', 5.6, 4.5, audio=audio('B6'),
              events=[{'t': 2.4, 'type': 'laugh', 'kind': 'man', 'far': True, 'seed': 23, 'gain': -3}]))
#   B4p は奥のコースの車が人の乗ったカートに化けるので、コースの所だけ最初のコマで止めた（freeze_region.py --poly --still）
S.append(shot('B4p', '一', '駄菓子屋の裏のコース（男の手に小さな四駆）', 6.4,
              audio=still_audio(['cicadas_far', 'kids_near'], 4)))
# B5：残高の補充後、少年とあの子を手前の後ろ姿にした原画 B5_v3 から作り直した Veo（B5_v2）の 3.8〜8.0 秒。写真のまま 5.6 秒→元の速さで 4.2 秒
#   少年の頬と目元が少し見えるので、あの子とコースだけを切り抜いてある（natural_plan_v10.json の crop）
B5 = shot('B5', '一', '昭和のコース（思い出：写真から動き出す）', 11.0, 4.2, clipAt=5.6, memory=True, push=[1.0, 1.04],
          captions=[cap(4.0, 9.4, '同じコースを、あの子と走った。')], audio=audio('B5'))
S.append(B5)
# ---------------- 二　昼さがり（島へ、島の家） ----------------
#   C2s は、屋上の大きすぎる子どもを原画で消した C2_v3 から
S.append(shot('C2s', '二', '島への船（近づく島）', 6.6,
              chapterCard=card(0.8, 5.6, '二', '昼さがり', '午後一時'), audio=still_audio(['ferry_deck', 'distant_sea'], 4)))
S.append(shot('C2', '二', '島への船（男と古いロボット）', 7.0, 6.0, captions=[cap(0.9, 5.6, '生まれた島へ。')], audio=audio('C2')))
S.append(shot('C4a', '二', '交換日記（1986年のページ）', 6.8, push=[1.0, 1.04],
              ink=[{'bake': True, 'quad': C4_L, 'aspect': 0.7, 'items': KIDS_1986}], audio=still_audio(['clock_tick', 'cicadas_outside'], 3)))
C4B_CROP = (0.15, 0.15, 0.75)
S.append(shot('C4b', '二', '交換日記（毎年の一行）', 7.0, push=[1.0, 1.035],
              ink=[{'bake': True, 'quad': crop_quad(C4_L, *C4B_CROP), 'aspect': 0.7, 'items': WOMAN_YEARS}],
              audio=still_audio(['clock_tick', 'cicadas_outside'], 3)))
S.append(shot('C5', '二', '日記のつづき（ロボットの字と砂丘の絵）', 4.8, 4.0, ink=C5_INK, audio=audio('C5')))
S.append(shot('C5s', '二', '日記のつづき（ロボットの字、寄り）', 6.6, push=[1.0, 1.04],
              captions=[cap(1.0, 5.8, 'ある年から、字が変わっていた。')], audio=still_audio(['clock_tick', 'distant_sea'], 3)))
S.append(shot('C6', '二', '柱の傷（背くらべ）', 7.0, 8.0, ink=C6_INK, captions=[cap(0.9, 6.0, '背くらべは、あの夏で止まっている。')],
              audio=audio('C6')))
# ---------------- あの頃（昭和61年） ----------------
S.append(shot('R1', 'あの頃', '神社の境内の秋（写真から動き出す）', 7.4, 2.5, clipAt=4.0, memory=True, push=[1.0, 1.05],
              chapterCard=card(0.8, 5.6, 'あの頃', '', '昭和六十一年'), audio=audio('R1')))
S.append(shot('R2', 'あの頃', '雪の正月', 8.2, 4.3, clipAt=3.4, memory=True, push=[1.0, 1.04], audio=audio('R2')))
S.append(shot('R3', 'あの頃', '授業参観', 11.6, 8.0, clipAt=3.2, memory=True, ink=R3_INK, push=[1.0, 1.03], audio=audio('R3')))
S.append(shot('R4p', 'あの頃', '夜の桟橋（止め絵：島の灯りを見るふたり）', 7.0, memory=True, push=[1.0, 1.05],
              audio=still_audio(['night_sea', 'insects'], 0)))
S.append(shot('R4', 'あの頃', '消えていく灯り', 7.6, 6.75, clipAt=0.6, memory=True, audio=audio('R4'),
              events=[{'t': 3.0, 'type': 'foghorn', 'gain': -6}]))
S.append(shot('R5', 'あの頃', '最後の花火', 11.8, 8.0, clipAt=3.2, memory=True, push=[1.0, 1.03],
              captions=[cap(5.0, 10.6, '来年も、いっしょに見ようね。')], audio=audio('R5', veo=0.8),
              events=[{'t': 4.0, 'type': 'laugh', 'kind': 'kid', 'far': True, 'seed': 24, 'gain': -2}]))
S.append(shot('R6p', 'あの頃', '別れの朝（写真：お守りの手渡し）', 7.6, memory=True, push=[1.0, 1.05],
              captions=[cap(1.2, 6.8, 'あれが最後の夏だったなんて。')], audio=still_audio(['harbor_morning', 'pier_crowd'], -3),
              events=[{'t': 1.0, 'type': 'ferry_horn', 'gain': -8}]))
S.append(shot('R6', 'あの頃', '別れの朝（桟橋を歩くふたり）', 4.0, 3.0, memory=True, audio=audio('R6'), events=[]))
# ---------------- 三　夕暮れ ----------------
S.append(shot('D1', '三', '高台の神社（再生記念の額）', 9.0, 8.0, ink=D1_INK,
              chapterCard=card(0.8, 4.8, '三', '夕暮れ', '午後五時'),
              captions=[cap(5.0, 8.8, '島に灯りを戻したのは、あの子だった。')],
              audio=audio('D1'), events=[{'t': 1.0, 't_end': 9.0, 'type': 'town_chime'}]))
# D2：残高の補充後（2026年10月12日）、男を後ろ姿にした原画 D2_v3 から Veo を作り直した。元の速さで 8 秒（最後の 0.4 秒は次のカットとの重なり）。
#   缶の音とヒグラシは Veo の音（音楽・声なしを2回の試聴で確認）。子どもの遠い声は合成の環境音
D2 = copy.deepcopy(V9['D2']); D2.pop('push', None)
D2.update(dur=8.4, clip=8.0, chapter='三', name='境内の缶蹴り', captions=[cap(1.2, 6.8, '夕方5時の、帰りたくない気持ち。')],
          events=[], audio={'veo': 1.0, 'beds': ['higurashi', 'kids_play']})
S.append(D2)
# ---------------- 四　夜 ----------------
S.append(shot('E1', '四', '灯りの島', 8.4, 7.5, chapterCard=card(0.8, 4.6, '四', '夜', '午後七時五十分'),
              captions=[cap(4.8, 8.2, '消えた窓に、また灯りがともる。')], audio=audio('E1')))
S.append(shot('E2', '四', '線香花火（止め絵）', 7.4, push=[1.0, 1.05], shade=V9['E2']['shade'], grade=V9['E2']['grade'],
              captions=[cap(1.2, 6.6, '線香花火は、今もぽとりと落ちる。')], audio=still_audio(['insects', 'sparkler'], 2),
              events=[{'t': 3.6, 'type': 'laugh', 'kind': 'kid', 'far': False, 'soft': True, 'seed': 26, 'gain': -6}]))
S.append(shot('E3', '四', 'お守り（紙を開く）', 5.6, 4.6, ink=E3_INK, audio=audio('E3')))
S.append(shot('E3s', '四', 'お守り（寄り）', 6.8, push=[1.0, 1.04], captions=[cap(1.4, 6.2, 'あの子の字だった。')],
              audio=still_audio(['insects'], 4)))
#   E4s は2本目（E4s_v2）。1本目はロボットの頭の横に青い丸い光が出た
S.append(shot('E4s', '四', '屋上の三人', 7.4, captions=[cap(1.0, 6.6, '来年も、いっしょに見ようね。')],
              audio=still_audio(['insects', 'night_sea'], 3)))
S.append(shot('E4', '四', '屋上の三人（飛行車）', 4.6, 2.9, captions=[cap(0.9, 3.8, 'ピ。')], audio=audio('E4'),
              events=[{'t': 0.9, 'type': 'robot_pi'}]))
# ---------------- 結・予告 ----------------
F0 = copy.deepcopy(V9['F0']); F0.update(dur=30.0, clip=12.0, push=[1.0, 1.06], audio=audio('F0', veo=0.7),
                                         captions=[cap(2.0, 7.6, '変わっていくものと、変わらないもの。'), cap(8.2, 13.8, '僕の大好きなあの頃は、そのままに。')],
                                         endCard=dict(V9['F0']['endCard'], t0=15.0, t1=29.4),
                                         events=[{'t': 4.0, 'type': 'foghorn', 'gain': -9}, {'t': 19.5, 'type': 'voice', 'file': 'outro/closing.wav'}])  # 曲の最後の和音（18.5秒）のあとに
S.append(F0)
S.append(shot('T0', '予告', '第三章 予告（窓の外の嵐）', 4.4, 3.0, captions=[cap(0.4, 4.2, '九月。台風が、近づいていた。')], audio=audio('T0')))
S.append(shot('T0s', '予告', '第三章 予告（雨戸を閉める）', 10.0, push=[1.0, 1.05],
              title=dict(V9['T0']['title'], t0=1.0, t1=9.4), audio=still_audio(['wind_sea'], 3)))

for s_ in S:
    if s_['id'] != 'H0' and not s_.get('clipAt') and s_.get('clip') == s_['dur']:
        s_['dur'] = round(s_['dur'] + 0.6, 2); s_['clip'] = s_['dur']
for s_ in S:
    if s_['id'] == 'F0': s_['dur'] = 32.0; s_['endCard']['t1'] = 31.4
    if s_['id'] == 'P1': s_['dur'] = 17.0; s_['title']['t1'] = 16.2
    if s_['id'] == 'P0': s_['dur'] = 15.0; s_['veil'][0].update(t0=9.4, t1=15.0)

T = {k: v for k, v in base.items() if k != 'shots'}
T['shots'] = S
XF = T['crossfade']
(root / 'src' / 'timeline.json').write_text(json.dumps(T, ensure_ascii=False, indent=1), encoding='utf-8')
st = 0.0; prev = None
for s in S:
    if s.get('chapter') != prev:
        print(f"{int(st // 60)}:{st % 60:04.1f}  {s.get('chapter')}  {s['id']}")
        prev = s.get('chapter')
    st += s['dur'] - XF
total = st + XF
print('shots', len(S), ' total', round(total, 1), 's =', f'{int(total // 60)}:{total % 60:04.1f}')
