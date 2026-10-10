#!/usr/bin/env python3
"""新しい作品フォルダを作る（絵コンテの見本・概要欄の型・空の修正ファイル・素材フォルダ）。

  python3 new_project.py <作品フォルダ>
既存のフォルダの中身は上書きしない（あるファイルはそのまま）。
"""
import os, shutil, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
if len(sys.argv) != 2: sys.exit(__doc__)
P = os.path.abspath(sys.argv[1])
for d in ("assets/chars", "assets/img", "assets/clips", "assets/music", "assets/voice", "assets/overlay", "assets/fonts", "out", "work", "research"):
    os.makedirs(os.path.join(P, d), exist_ok=True)
def put(src, dst):
    dst = os.path.join(P, dst)
    if os.path.exists(dst): print("keep", dst); return
    shutil.copy(os.path.join(SKILL, src), dst); print("new ", dst)
put("assets/example_storyboard.py", "storyboard.py")
put("assets/description_template.txt", "description_template.txt")
for rel, obj in (("fixes.json", {"_説明": "画像の修正。crop=[x0,y0,x1,y1] カメラが動く範囲、blur=[[x0,y0,x1,y1,半径],...] ぼかす範囲、stamp={text,x,y,rot,scale} 写真に日付を描く（すべて画像に対する割合）"}),
                 ("assets/overlay/lcd.json", {})):
    p = os.path.join(P, rel)
    if not os.path.exists(p):
        json.dump(obj, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1); print("new ", p)
gi = os.path.join(P, ".gitignore")
if not os.path.exists(gi):
    open(gi, "w").write("# 生成メディアは大きいのでコミットしない\nassets/*\n!assets/overlay/\nwork/\nout/*.mp4\nout/*.wav\nout/*.png\nout/*.jpg\n__pycache__/\n")
print(f"""
次にやること：
  bash {HERE}/setup_fonts.sh {P}/assets/fonts
  （storyboard.py を作品に合わせて書き換える）→ python3 {P}/storyboard.py
  export PROJ={P}
""")
