# 2つの画像（印刷の PDF の画像と、Excel を LibreOffice で PDF にした画像）を左右に並べた1枚にする。Read で見比べる用。
# usage: python3 side-by-side.py <左.png> <右.png> <出力.png>   （Pillow が要る：pip install pillow）
import sys
from PIL import Image
a, b = Image.open(sys.argv[1]).convert('RGB'), Image.open(sys.argv[2]).convert('RGB')
h = max(a.height, b.height)
out = Image.new('RGB', (a.width + b.width + 20, h), 'white')
out.paste(a, (0, 0))
out.paste(b, (a.width + 20, 0))
out.save(sys.argv[3])
print(sys.argv[3], out.size)
