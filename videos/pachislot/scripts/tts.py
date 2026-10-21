#!/usr/bin/env python3
"""台本（script.json）の行を Gemini TTS で読み上げ、文字起こしで台本どおりか確かめる。

  python3 -I scripts/tts.py --ep honne02                 # 全行（キャッシュ済みの行は飛ばす）
  python3 -I scripts/tts.py --ep honne02 --only a1 a1t   # 指定行だけ作り直す（take を1つ進める）
  python3 -I scripts/tts.py --voice Kore --only hook --out-dir work/audition   # 声の試し録り

登場人物が何人もいる回は、script.json の cast に話し手ごとの声（name）と人物像（profile）を書き、行に who を付ける。

演技指示は英語の構造化プロンプト（AUDIO PROFILE / SCENE / DIRECTOR NOTES / TRANSCRIPT）。
日本語で指示を書くと指示文まで読み上げることがあるため。
"""
import argparse, concurrent.futures as cf, json, os, re, sys, threading, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gapi
from common import episode

EP = episode()
S = EP.script()
ap = argparse.ArgumentParser()
ap.add_argument('--only', nargs='*')
ap.add_argument('--voice', default=None, help='省略時は行の話し手（cast）の声、なければ回の声')
ap.add_argument('--out-dir', default=EP.voice)
ap.add_argument('--tries', type=int, default=3)
ap.add_argument('--force', action='store_true')
ap.add_argument('--jobs', type=int, default=1, help='並行して録る行数')
a = ap.parse_args()
os.makedirs(a.out_dir, exist_ok=True)


def prompt_for(ln):
    v = EP.voice_of(ln, S)
    notes = S['styles'][ln['style']] + (' ' + ln['note'] if ln.get('note') else '')  # 行ごとの補足（読み方・前置き禁止など）
    return (f"# AUDIO PROFILE: {v['profile']}\n## SCENE: {v['scene']}\n"
            f"### DIRECTOR NOTES: {notes} Read only the transcript below, exactly as written. "
            f"Do not read these notes aloud.\n#### TRANSCRIPT\n{ln.get('speak', ln['text'])}")


def norm(t):
    t = unicodedata.normalize('NFKC', t)
    return re.sub(r'[\s、。…・,.!?！？「」『』〜~\-—]', '', t)


def transcribe(path):
    """ひらがなで書き起こす（漢字の当て字や「SC」を「ST」と書く思い込みで、正しい読みを誤読と判定しないため）"""
    return gapi.ask('Transcribe all speech in this audio verbatim, written ONLY in Japanese hiragana exactly as it is '
                    'pronounced. Convert kanji, numbers and Latin letters to hiragana by their spoken sound '
                    '(for example SC spoken as "esushii" becomes えすしー, 7000 spoken as "nanasen-en" becomes ななせんえん). '
                    'Keep every sound you hear, including fillers or sighs. Output only the hiragana transcript.', [path])


def judge(heard, ln):
    """表記ゆれ（漢字・かな）は Gemini に判定させ、言葉の抜け・足し・誤読だけを NG にする。"""
    want = ln['text']
    # 台本にある英字（BIG・REG・BGM など）は読んで当然なので、それ以外の英語だけを指示文の読み上げとみなす
    allowed = {w.upper() for w in re.findall(r'[A-Za-z]{3,}', want + ln.get('speak', ''))}
    eng = [w for w in re.findall(r'[A-Za-z]{3,}', heard or '') if w.upper() not in allowed]
    if eng:
        return False, f'English heard (notes read aloud?): {" ".join(eng[:5])}'
    q = (f'台本: 「{want}」\n読み仮名の指定: 「{ln.get("speak", want)}」\n聞き取り結果（ひらがな）: 「{heard}」\n'
         '聞き取り結果は、台本どおりの言葉を、読み仮名の指定どおりの読みで発音していますか？ 句読点・間、'
         '文末の母音の伸ばし（ねえ／ね）の違いは無視し、言葉の抜け・追加（「ああ」「はあ」「まあ」などの前置きも含む）・'
         '言い換え・明らかな読み間違い（例: じゅうおう を ちゅうおう、かえた を かえった）だけを問題にしてください。'
         'JSON で {"ok": true/false, "reason": "..."} だけを返してください。')
    r = json.loads(gapi.ask(q, json_out=True))
    return bool(r.get('ok')), r.get('reason', '')


takes_path = os.path.join(EP.voice, 'takes.json')
takes = json.load(open(takes_path)) if os.path.exists(takes_path) else {}
lock = threading.Lock()


def do_line(ln):
    lid = ln['id']
    out = os.path.join(a.out_dir, f'{lid}.wav')
    best = None
    voice = a.voice or EP.voice_of(ln, S)['name']
    for k in range(a.tries):
        dur = gapi.tts(prompt_for(ln), voice, out, model=S['voice']['model'])
        heard = transcribe(out)
        ok, why = judge(heard, ln)
        print(f'{lid} try{k + 1} {voice} {dur:.2f}s -> {heard!r} {"OK" if ok else "NG " + why}', flush=True)
        best = dict(ok=ok, heard=heard, why=why, dur=round(dur, 3), voice=voice)
        if ok:
            break
    if a.out_dir == EP.voice:
        with lock:
            takes[lid] = dict(best, take=takes.get(lid, {}).get('take', 0) + 1, text=ln['text'])
            json.dump(takes, open(takes_path, 'w'), ensure_ascii=False, indent=1)


todo = [ln for ln in S['lines'] if (not a.only or ln['id'] in a.only)
        and (a.only or a.force or not os.path.exists(os.path.join(a.out_dir, f"{ln['id']}.wav")))]
# --jobs で行を並行して録る（台本の順番は takes.json と timeline には影響しない）
with cf.ThreadPoolExecutor(max(1, a.jobs)) as ex:
    list(ex.map(do_line, todo))
