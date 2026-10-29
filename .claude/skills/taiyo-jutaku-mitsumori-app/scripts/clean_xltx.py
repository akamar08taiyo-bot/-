# LibreOffice で作った原本の仕上げ：文書のプロパティの作成者・更新者・印刷日を消す（ほかはそのまま）
import re, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(src)
files = {n: z.read(n) for n in z.namelist()}
core = files['docProps/core.xml'].decode()
core = re.sub(r'<dc:creator>[^<]*</dc:creator>', '<dc:creator></dc:creator>', core)
core = re.sub(r'<cp:lastModifiedBy>[^<]*</cp:lastModifiedBy>', '<cp:lastModifiedBy></cp:lastModifiedBy>', core)
core = re.sub(r'<cp:lastPrinted>[^<]*</cp:lastPrinted>', '', core)
core = re.sub(r'<dc:title>[^<]*</dc:title>', '', core)
files['docProps/core.xml'] = core.encode()
assert not any('externalLink' in n or 'printerSettings' in n for n in files), [n for n in files if 'external' in n or 'printer' in n]
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as out:
    for n in z.namelist():
        out.writestr(n, files[n])
print('ok', len(files))
