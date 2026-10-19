#!/usr/bin/env python3
"""台本（script.json）の行を Gemini TTS で読み上げ、文字起こしで台本どおりか確かめる。

  python3 -I scripts/tts.py                 # 全行（キャッシュ済みの行は飛ばす）
  python3 -I scripts/tts.py --only a1 a1t   # 指定行だけ作り直す（take を1つ進める）
  python3 -I scripts/tts.py --voice Kore --only hook --out-dir work/audition   # 声の試し録り

演技指示は英語の構造化プロンプト（AUDIO PROFILE / SCENE / DIRECTOR NOTES / TRANSCRIPT）。
日本語で指示を書くと指示文まで読み上げることがあるため。
"""
import argparse, json, os, re, sys, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gapi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(ROOT, 'script.json'), encoding='utf-8'))
ap = argparse.ArgumentParser()
ap.add_argument('--only', nargs='*')
ap.add_argument('--voice', default=S['voice']['name'])
ap.add_argument('--out-dir', default=os.path.join(ROOT, 'assets', 'voice'))
ap.add_argument('--tries', type=int, default=3)
ap.add_argument('--force', action='store_true')
a = ap.parse_args()
os.makedirs(a.out_dir, exist_ok=True)


def prompt_for(ln):
    v = S['voice']
    notes = S['styles'][ln['style']]
    return (f"# AUDIO PROFILE: {v['profile']}\n## SCENE: {v['scene']}\n"
            f"### DIRECTOR NOTES: {notes} Read only the transcript below, exactly as written. "
            f"Do not read these notes aloud.\n#### TRANSCRIPT\n{ln.get('speak', ln['text'])}")


def norm(t):
    t = unicodedata.normalize('NFKC', t)
    return re.sub(r'[\s、。…・,.!?！？「」『』〜~\-—]', '', t)


def transcribe(path):
    return gapi.ask('Transcribe all speech in this audio verbatim. Output only the Japanese transcript as spoken, '
                    'nothing else. If you hear any English words, include them too.', [path])


def judge(heard, ln):
    """表記ゆれ（漢字・かな）は Gemini に判定させ、言葉の抜け・足し・誤読だけを NG にする。"""
    want = ln['text']
    if re.search(r'[A-Za-z]{3,}', heard or ''):
        return False, 'English heard (notes read aloud?)'
    q = (f'台本: 「{want}」\n読み仮名の指定: 「{ln.get("speak", want)}」\n聞き取り結果: 「{heard}」\n'
         '聞き取り結果は、台本どおりの言葉を読んでいますか？ 漢字とかなの表記の違いや句読点は無視し、'
         '言葉の抜け・追加・言い換え・明らかな読み間違い（例: 何組を「なにぐみ」）だけを問題にしてください。'
         'JSON で {"ok": true/false, "reason": "..."} だけを返してください。')
    r = json.loads(gapi.ask(q, json_out=True))
    return bool(r.get('ok')), r.get('reason', '')


takes_path = os.path.join(ROOT, 'assets', 'voice', 'takes.json')
takes = json.load(open(takes_path)) if os.path.exists(takes_path) else {}
for ln in S['lines']:
    lid = ln['id']
    if a.only and lid not in a.only:
        continue
    out = os.path.join(a.out_dir, f'{lid}.wav')
    if os.path.exists(out) and not a.only and not a.force:
        continue
    best = None
    for k in range(a.tries):
        dur = gapi.tts(prompt_for(ln), a.voice, out, model=S['voice']['model'])
        heard = transcribe(out)
        ok, why = judge(heard, ln)
        print(f'{lid} try{k + 1} {a.voice} {dur:.2f}s -> {heard!r} {"OK" if ok else "NG " + why}', flush=True)
        best = dict(ok=ok, heard=heard, why=why, dur=round(dur, 3), voice=a.voice)
        if ok:
            break
    if a.out_dir == os.path.join(ROOT, 'assets', 'voice'):
        takes[lid] = dict(best, take=takes.get(lid, {}).get('take', 0) + 1, text=ln['text'])
        json.dump(takes, open(takes_path, 'w'), ensure_ascii=False, indent=1)
