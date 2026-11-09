# 介援隊カタログの機能アイコン（ひじ掛け・ひじ掛け跳ね上げ・座面回転・リクライニングなど）を、ページの絵の背景の明るさで読み、
# src/tokutei/catalogFeatures.ts の表（CATALOG_FEATURES）を書く。アイコンは白い字で、背景が黒＝あり、灰色＝なし。
# （2026-11-09 のユーザーの指摘：ユクリア コンパクトで、肘付き（コンパクトSPおりたたみN）を見積もるはずが、肘なし（コンパクトおりたたみN）の型番が入った。
#   カタログでは肘掛けの有無が名前の「SP」とアイコンでしか分からない）
# 使い方：catalog-render.mjs で 300dpi の絵を作り、catalog-dump.ts で products.json を作ってから
#   python3 catalog-icons.py <リポジトリ> <300dpi の絵のフォルダ> <products.json>
import json, statistics, sys
from PIL import Image
repo, pages_dir, products = sys.argv[1:4]
T = json.load(open(f'{repo}/dist-tokutei/catalog/text.json', encoding='utf-8'))
P = json.load(open(products, encoding='utf-8'))
LABELS = ['ひじ掛け', 'ひじ掛け跳ね上げ', 'ひじ掛け昇降', 'ひじ掛け着脱', 'ひじ掛け高さ調整', '座面回転', 'ソフト座面', 'シャワーフック', 'ワンタッチ',
          'リクライニング', 'スイングアウト', 'フットレスト着脱', 'フットブレーキ']
K = 300 / 72
feat = {}
problems = []
for f, toks in T.items():
    page = int(f[-7:-4])
    im = Image.open(f'{pages_dir}/kaientai-p{page:03d}.png').convert('L')
    for s, x, y, w, h in toks:
        lab = s.strip()
        if lab not in LABELS:
            continue
        px = list(im.crop((int(x * K), int((y - h) * K), int((x + w) * K), int(y * K))).getdata())
        med = statistics.median(px) if px else 255
        if med > 235:
            continue  # 白地の本文の字（アイコンではない）
        if 110 <= med <= 160:
            problems.append(f'p.{page} {lab}：背景の明るさ {med} で、あり・なしが分からない')
            continue
        cx, cy = x + w / 2, y - h / 2
        hit = [p for p in P if p['page'] == page and p['box']['x'] - 2 <= cx <= p['box']['x'] + p['box']['w'] + 2 and p['box']['y'] - 2 <= cy <= p['box']['y'] + p['box']['h'] + 8]
        if len(hit) != 1:
            problems.append(f'p.{page} {lab}：どの商品のアイコンか決まらない（{len(hit)}）')
            continue
        p = hit[0]
        k = (p['page'], p['variants'][0]['orderCode'], p['variants'][0]['code'], p['name'])
        feat.setdefault(k, {})[lab] = med < 110
if problems:
    print('\n'.join(problems))
    sys.exit(1)
lines = []
for (page, order, code, name), f in sorted(feat.items()):
    on = [l for l in LABELS if f.get(l) is True]
    off = [l for l in LABELS if f.get(l) is False]
    lines.append(f"  {{page: {page}, order: '{order}', code: '{code}', on: {json.dumps(on, ensure_ascii=False)}, off: {json.dumps(off, ensure_ascii=False)}}}, // {name}")
src = f'''// 介援隊カタログの機能アイコン（ひじ掛け・ひじ掛け跳ね上げ・座面回転・リクライニングなど）。アイコンは白い字で、背景が黒＝あり・灰色＝なし。
// ページの絵の背景の明るさで読んだ（.claude/skills/taiyo-tokutei-app/scripts/catalog-icons.py で作る。手で直さない）。
// ユーザーの指摘（2026-11-09）：「パナソニックのユクリア コンパクトシャワーチェアで、本来は肘付きを見積もりに出さないといけないところを、肘なしの分で
// 照合して型番が出てきた。金額を負けなければいけない状況になった」。カタログでは肘掛けの有無が名前の「SP」とこのアイコンでしか分からず、
// アプリの一覧にも出ていなかった → 一覧・色を選ぶ欄・入れた商品の欄に「ひじ掛けあり／なし」を出し、商品検索で「肘付き」「肘なし」でも絞れるようにする。
// 1つの商品に当たる目印：ページ・注文番号・1つ目の品番（test/tokutei/catalogItems.test.ts がどれも1つの商品に当たるかを見る）
export type CatalogFeatureRow = {{page: number; order: string; code: string; on: string[]; off: string[]}};
export const CATALOG_FEATURES: CatalogFeatureRow[] = [
{chr(10).join(lines)}
];
'''
open(f'{repo}/src/tokutei/catalogFeatures.ts', 'w', encoding='utf-8').write(src)
print('商品', len(feat))
