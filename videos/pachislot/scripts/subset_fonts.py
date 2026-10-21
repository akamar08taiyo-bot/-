#!/usr/bin/env python3
"""画面に出る文字だけを残した小さなフォント（woff2）を作る。 python3 -I scripts/subset_fonts.py

元のフォント（assets/fonts/*.ttf、数MB）は描画のたびに各タブで読み込むと時間切れになりやすいため、
全部の回の script.json と src/ の中の文字だけに絞って public/fonts/*.woff2（数十KB）にする。台本を変えたら作り直す。
絞ったフォントは src/fonts_data.ts にも埋め込む（書き出しのタブがフォントをネットワークで取りに行かず、時間切れにならないように）。
"""
import base64, glob, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chars = set(chr(c) for c in range(0x20, 0x7f))  # 英数字・記号はすべて
chars |= set('、。，．！？「」『』（）…・ー〜→①②③④⑤')
for path in glob.glob(os.path.join(ROOT, 'episodes', '*', 'script.json')) + glob.glob(os.path.join(ROOT, 'src', '**', '*.ts*'), recursive=True):
    chars |= set(re.sub(r'\s', '', open(path, encoding='utf-8').read()))
text = ''.join(sorted(chars))
txt = os.path.join(ROOT, 'work', 'font_chars.txt')
os.makedirs(os.path.dirname(txt), exist_ok=True)
open(txt, 'w', encoding='utf-8').write(text)
os.makedirs(os.path.join(ROOT, 'public', 'fonts'), exist_ok=True)
embedded = {}
for src in sorted(glob.glob(os.path.join(ROOT, 'assets', 'fonts', '*.ttf'))):
    out = os.path.join(ROOT, 'public', 'fonts', os.path.basename(src).replace('.ttf', '.woff2'))
    subprocess.run([sys.executable, '-m', 'fontTools.subset', src, f'--text-file={txt}', '--flavor=woff2',
                    '--layout-features=*', f'--output-file={out}'], check=True)
    print(f'{os.path.basename(out)} {os.path.getsize(out) / 1024:.0f} KB')
    embedded[os.path.basename(out)] = base64.b64encode(open(out, 'rb').read()).decode()
with open(os.path.join(ROOT, 'src', 'fonts_data.ts'), 'w', encoding='utf-8') as f:
    f.write('// subset_fonts.py が作る（手で書き換えない）。絞ったフォントの woff2 を base64 で埋め込んだもの\n')
    f.write('export const FONT_DATA: Record<string, string> = ' + json.dumps(embedded) + ';\n')
print(f'{len(text)} 文字')
