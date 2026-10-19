#!/usr/bin/env python3
"""1行を何テイクか録り直し、読み間違いのないテイクの中から Gemini に聞き比べで選ばせる。

  python3 -I scripts/voice_takes.py a1 --ep honne02 --takes 4 --notes "演技の指示（英語）" --criteria "選ぶ基準（日本語）"

選ばれたテイクを episodes/<回>/voice/<行>.wav にし、work/<回>/takes/<行>/ に全テイクと判定を残す。
今の声も候補に入れて比べる（良くならなければ今のまま）。
"""
import argparse, json, os, re, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gapi
from common import episode

EP = episode()
S = EP.script()
ap = argparse.ArgumentParser()
ap.add_argument('id')
ap.add_argument('--takes', type=int, default=4)
ap.add_argument('--notes', default='')
ap.add_argument('--criteria', required=True)
a = ap.parse_args()
ln = next(l for l in S['lines'] if l['id'] == a.id)
v = S['voice']
notes = a.notes or S['styles'][ln['style']]
prompt = (f"# AUDIO PROFILE: {v['profile']}\n## SCENE: {v['scene']}\n### DIRECTOR NOTES: {notes} "
          f"Read only the transcript below, exactly as written. Do not read these notes aloud.\n"
          f"#### TRANSCRIPT\n{ln.get('speak', ln['text'])}")
d = os.path.join(EP.work, 'takes', a.id)
os.makedirs(d, exist_ok=True)
cur = os.path.join(EP.voice, f'{a.id}.wav')
cands = []
if os.path.exists(cur):
    shutil.copy(cur, os.path.join(d, 'current.wav'))
    cands.append(os.path.join(d, 'current.wav'))
for k in range(a.takes):
    out = os.path.join(d, f't{k + 1}.wav')
    gapi.tts(prompt, v['name'], out, model=v['model'])
    heard = gapi.ask('Transcribe all speech in this audio verbatim in Japanese. Output only the transcript.', [out])
    q = (f'台本: 「{ln["text"]}」\n聞き取り: 「{heard}」\n表記の違い・句読点は無視して、言葉の抜け・追加・言い換え・読み間違いがあるか。'
         'JSON {"ok": true/false, "reason": "..."} だけ返す。')
    r = json.loads(gapi.ask(q, json_out=True))
    print(f't{k + 1}: {heard!r} {"OK" if r.get("ok") else "NG " + r.get("reason", "")}', flush=True)
    if r.get('ok') and not re.search(r'[A-Za-z]{3,}', heard):
        cands.append(out)
names = [os.path.splitext(os.path.basename(c))[0] for c in cands]
q = (f'添付の音声は順に {", ".join(names)} です。どれも同じ一言「{ln["text"]}」を、40代の既婚女性ナレーター'
     f'（落ち着いた低めの声・ちょっと毒舌だけど視聴者の味方）が読んだテイクです。\n選ぶ基準: {a.criteria}\n'
     'テイクごとに10点満点で採点し、理由を一言。JSON {"scores": {"名前": 点, ...}, "best": "名前", "why": "..."} だけ返す。')
res = json.loads(gapi.ask(q, cands, think='medium', json_out=True))
json.dump({'prompt': prompt, 'candidates': names, 'result': res}, open(os.path.join(d, 'judge.json'), 'w'),
          ensure_ascii=False, indent=1)
best = res.get('best')
print('scores', res.get('scores'), '\nbest', best, '-', res.get('why'))
if best in names and best != 'current':
    shutil.copy(cands[names.index(best)], cur)
    print('->', cur, 'を差し替え')
