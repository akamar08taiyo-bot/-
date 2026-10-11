# Veo の生成を4並列で行う。既に assets/veo/<ID>_v*.mp4 があるカットは飛ばす（ID を指定した時は作り直す）
# 使い方: python3 -I scripts/veo_batch.py [ID ...]
# 指示は assets/veo/prompts.json から作る：
#   {"common_tail": "...", "shots": {"A1": {"photo": "N02_v2", "prompt": "...", "tail"?: "..."}}}
#   photo は原画の ID と採用した版（N02_v2）。版を省くと一番新しい版。作業フォルダからの相対パス（assets/…/x.png）も書ける
#   送る文は prompt + " " + (tail または common_tail)
# prompts.json が無ければ work/veojobs.txt（1行1JSON：{"id","img","prompt"}）を使う
import json, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
root = Path(__file__).resolve().parent.parent
gen = root / 'assets' / 'gen'
pfile = root / 'assets' / 'veo' / 'prompts.json'
jfile = root / 'work' / 'veojobs.txt'


def photo_path(photo):
    if '/' in photo:
        return photo
    if re.search(r'_v\d+$', photo):
        c = [p for e in ('.jpg', '.png') if (p := gen / f'{photo}{e}').exists()]
    else:
        c = sorted(gen.glob(f'{photo}_v*.*'), key=lambda p: int(re.search(r'_v(\d+)', p.stem).group(1)))
        c = [p for p in c if p.suffix in ('.jpg', '.png')][-1:]
    assert c, f'原画がありません: {photo}'
    return str(c[-1].relative_to(root))


if pfile.exists():
    P = json.loads(pfile.read_text(encoding='utf-8'))
    jobs = [{'id': k, 'img': photo_path(v['photo']), 'prompt': v['prompt'] + ' ' + v.get('tail', P['common_tail'])}
            for k, v in P['shots'].items()]
    jfile.parent.mkdir(parents=True, exist_ok=True)
    jfile.write_text(''.join(json.dumps(j, ensure_ascii=False) + '\n' for j in jobs), encoding='utf-8')  # 送った内容の記録
else:
    jobs = [json.loads(l) for l in jfile.read_text(encoding='utf-8').splitlines() if l.strip()]
only = set(sys.argv[1:])
unknown = only - {j['id'] for j in jobs}
assert not unknown, f'指示のない ID: {sorted(unknown)}'
(root / 'work' / 'genlogs').mkdir(parents=True, exist_ok=True)


def run(j):
    if only and j['id'] not in only:
        return j['id'], 'skip'
    if list((root / 'assets' / 'veo').glob(f"{j['id']}_v*.mp4")) and not only:
        return j['id'], 'exists'
    r = subprocess.run(['python3', '-I', str(root / 'scripts' / 'veo.py'), j['id'], str(root / j['img']), j['prompt'],
                        '--model', 'veo-3.1-lite-generate-preview', '--res', '1080p'], capture_output=True, text=True)
    (root / 'work' / 'genlogs' / f"veo_{j['id']}.log").write_text(r.stdout + r.stderr)
    return j['id'], (r.stdout.strip().splitlines() or ['?'])[-1][:160]


with ThreadPoolExecutor(4) as ex:
    for jid, msg in ex.map(run, jobs):
        print(jid, msg, flush=True)
