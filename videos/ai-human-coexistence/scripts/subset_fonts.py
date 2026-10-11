# 本編で使う文字（src/timeline.json の文言＋英数字・記号）だけを残したフォントを作る → public/fonts/sub
# 和文フォントは1本数MBあり、書き出し時に毎回読むと時間切れになるため
import subprocess
from pathlib import Path
root = Path(__file__).resolve().parent.parent
chars = set((root / 'src' / 'timeline.json').read_text(encoding='utf-8'))
chars |= set(chr(c) for c in range(0x20, 0x7f))
chars |= set('、。・〜～：（）「」『』！？…―ー　↑↓←→℃0123456789０１２３４５６７８９年月日時分午前後')
txt = root / 'work' / 'font_chars.txt'; txt.parent.mkdir(exist_ok=True)
txt.write_text(''.join(sorted(c for c in chars if c.isprintable() or c == '　')), encoding='utf-8')
for src, dst in [('ZenOldMincho-Regular', 'MinchoR'), ('ZenOldMincho-Bold', 'MinchoB'), ('ZenMaruGothic-Bold', 'MaruB'), ('ZenMaruGothic-Black', 'MaruK')]:
    subprocess.run(['pyftsubset', str(root / 'public' / 'fonts' / f'{src}.ttf'), f'--text-file={txt}',
                    f'--output-file={root / "public" / "fonts" / "sub" / f"{dst}.ttf"}', '--layout-features=*', '--no-hinting'], check=True)
print('ok')
