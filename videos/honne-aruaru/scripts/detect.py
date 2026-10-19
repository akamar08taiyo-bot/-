#!/usr/bin/env python3
"""絵の中の顔（と小道具）の位置を Gemini に取らせて episodes/<回>/faces.json に書く。

  python3 -I scripts/detect.py --ep honne02 X1 X3 X5:bag X6 X7 X9 X10

場面名の後ろに ':名前' を付けると、その小道具の位置も取る（X5:bag → faces.json の X5_extra.bag）。
位置は [ymin, xmin, ymax, xmax]（0〜1000）。画面のカメラ（src/episodes/<回>.tsx）がこれを見て寄る。
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gapi
from common import episode

EP = episode()
WHO = ('WIFE（茶色い髪を低い位置でまとめた40代の女性・からし色のカーディガン）、'
       'HUSBAND（黒髪・黒縁メガネ・紺のパーカーの男性）、MOTHER-IN-LAW（白髪まじりのパーマ・丸メガネの年配の女性）、'
       'SON（赤白しま模様の男の子）、BABY（白いおくるみの赤ちゃん）、OTHER（その他の人）')
EXTRA = {'bag': 'ゴルフバッグ（クラブの入った袋）', 'paper': '机の上の緑のふちの紙', 'passbook': '通帳', 'socks': '夫の肩にかかった紺の靴下'}
path = os.path.join(EP.dir, 'faces.json')
faces = json.load(open(path)) if os.path.exists(path) else {}
for arg in sys.argv[1:]:
    scene, *extras = arg.split(':')
    img = os.path.join(EP.pub, 'img', f'{scene}.jpg')
    q = (f'この絵に出てくる人物の顔の位置を教えてください。人物の候補：{WHO}。'
         '見える人物ごとに、髪のてっぺんから顎までの顔の枠を [ymin, xmin, ymax, xmax]（0〜1000 の正規化座標）で。')
    if extras:
        q += ' さらに次の物の位置も同じ形式で：' + '、'.join(f'{e}（{EXTRA.get(e, e)}）' for e in extras) + '。'
    q += ' JSON {"faces": [{"who": "WIFE", "box": [..]}], "objects": {"名前": [..]}} だけを返してください。'
    r = json.loads(gapi.ask(q, [img], json_out=True))
    faces[scene] = r['faces']
    if extras:
        faces[f'{scene}_extra'] = {e: r.get('objects', {}).get(e) for e in extras}
    print(scene, r, flush=True)
faces.pop('placeholder', None)
json.dump(faces, open(path, 'w'), indent=1)
