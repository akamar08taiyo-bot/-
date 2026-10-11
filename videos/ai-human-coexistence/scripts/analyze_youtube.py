# Gemini に YouTube 動画を直接見てもらい、カット割り・文字・音・編集の型を JSON で返す
# （この環境からは YouTube に接続できないため、Gemini 側で動画を読み込む）
# 使い方: python3 -I scripts/analyze_youtube.py <YouTube URL> <出力.json> [開始秒 終了秒] [model]
# 長い動画は区間ごとに分けて送る（一度に送ると中継で切れるため）。区間内の時刻は動画全体の時刻で書かせる
import json, sys, time, urllib.request
url, out = sys.argv[1], sys.argv[2]
seg = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else None
model = sys.argv[5] if len(sys.argv) > 5 else 'gemini-3.8-flash'
prompt = ('' if not seg else f'これは動画の {seg[0]//60}:{seg[0]%60:02d}〜{seg[1]//60}:{seg[1]%60:02d} の区間です。時刻はすべて動画全体の時刻（mm:ss）で書いてください。この区間について分析してください。\n') + '''あなたは映像編集者・音響技師・映像研究者です。この YouTube 動画を最初から最後まで注意深く見て、聴いて、
同じ「型」で新作を作るための徹底分析を日本語で行ってください。推測には「推定」と明記し、見えない・聞こえないものを作らないでください。
次のキーを持つ JSON だけを返してください。
"overview": {"title_on_screen": 画面に出るタイトル文字（原文、無ければ null）, "duration": "mm:ss", "summary": 3〜5文の要約, "world": 年代・場所・技術・暮らしの設定, "story": 物語性の有無と流れ}
"chapters": [{"start": "mm:ss", "name": 章名や時間帯}]
"shots": [{"start": "mm:ss", "end": "mm:ss", "place": 場所, "subjects": 主な被写体と人物の行為, "camera": 固定/パン/ドリー/空撮/一人称 など, "motion": 画面内で動くもの, "light_color": 光と色, "text_in_frame": 看板やテロップの文字（読める範囲で原文）, "sound": そのカットで聞こえる音}]  ※全カットを漏れなく
"captions": [{"time": "mm:ss", "text": 原文, "position": 画面位置, "style": 書体・大きさ・色・出方（フェード等）}]
"audio": {"music": 音楽の有無と種類, "voice": 台詞・ナレーション・歌の有無, "ambience": 環境音の種類の一覧, "mix": 音量の付け方や場面転換での音のつなぎ方}
"editing": {"shot_count": 数, "avg_shot_sec": 平均カット長, "transitions": つなぎ方（カット/クロスフェード/暗転など）と割合, "pacing": テンポ, "opening": 冒頭の作り, "ending": 終わりの作り}
"motifs": 繰り返し出るモチーフの一覧
"ai_traits": AI生成映像らしさ（破綻、動きの特徴）と、それを目立たせない工夫
"why_it_works": 視聴者が懐かしさを感じる理由の分析（箇条書き）
"imitate": 新作で真似るべき型（箇条書き）
"avoid": 真似ると模倣・盗用になる固有要素（箇条書き）'''
body = {'contents': [{'role': 'user', 'parts': [dict({'fileData': {'fileUri': url}}, **({'videoMetadata': {'startOffset': f'{seg[0]}s', 'endOffset': f'{seg[1]}s', 'fps': 2}} if seg else {})), {'text': prompt}]}],
        'generationConfig': {'temperature': 0.2, 'responseMimeType': 'application/json', 'maxOutputTokens': 65536}}
req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
                             data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=900) as r:
        d = json.loads(r.read())
except urllib.error.HTTPError as e:
    print('HTTP', e.code, e.read().decode()[:1500]); sys.exit(1)
txt = ''.join(p.get('text', '') for p in d['candidates'][0]['content']['parts'])
open(out, 'w', encoding='utf-8').write(txt)
print('ok', round(time.time() - t0, 1), 's', d.get('usageMetadata'))
