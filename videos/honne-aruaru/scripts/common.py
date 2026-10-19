"""回（エピソード）ごとの置き場所。どのスクリプトも `--ep <id>`（または環境変数 EP、既定 honne01）で回を選ぶ。

  episodes/<id>/script.json   台本（行・テロップ・効果音・BGM の止め所）
  episodes/<id>/prompts.json  場面の絵の指示文
  episodes/<id>/voice/        声（行ごと）と takes.json
  episodes/<id>/timeline.json 行の時刻（prep_audio.py が作る）
  episodes/<id>/faces.json    絵の中の顔・小道具の位置
  public/<id>/img, audio      画面で使う絵と音
  work/<id>/                  作業用（静止画・ミックス・無音の映像）
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Ep:
    def __init__(self, ep_id):
        self.id = ep_id
        self.dir = os.path.join(ROOT, 'episodes', ep_id)
        self.pub = os.path.join(ROOT, 'public', ep_id)
        self.voice = os.path.join(self.dir, 'voice')
        self.gen = os.path.join(self.dir, 'gen')
        self.work = os.path.join(ROOT, 'work', ep_id)
        self.script_path = os.path.join(self.dir, 'script.json')
        self.timeline_path = os.path.join(self.dir, 'timeline.json')
        if not os.path.isdir(self.dir):
            sys.exit(f'episodes/{ep_id} がありません')
        os.makedirs(self.work, exist_ok=True)

    def script(self):
        return json.load(open(self.script_path, encoding='utf-8'))

    def timeline(self):
        return json.load(open(self.timeline_path, encoding='utf-8'))


def episode():
    """sys.argv から --ep を取り除いて Ep を返す（残りの引数は各スクリプトの argparse へ）"""
    ep = os.environ.get('EP', 'honne01')
    if '--ep' in sys.argv:
        i = sys.argv.index('--ep')
        ep = sys.argv[i + 1]
        del sys.argv[i:i + 2]
    return Ep(ep)
