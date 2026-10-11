# work/veojobs.txt（1行1JSON）の Veo 生成を並列実行。既に out があるものは飛ばす
import json, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
root = Path(__file__).resolve().parent.parent
jobs = [json.loads(l) for l in (root / 'work' / 'veojobs.txt').read_text().splitlines() if l.strip()]
only = set(sys.argv[1:])
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
