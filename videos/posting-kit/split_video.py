# 仕上がった動画（テーマ曲入り・環境音のみ）を、投稿キットに載せられる大きさに分ける
# - 2つの版は映像がまったく同じなので、断片化した MP4（fMP4）にして、映像の断片は1組だけ持ち、音の断片を版ごとに持つ
# - ページは「頭（ftyp＋moov）→ 断片を元の順に → 終わり（mfra）」をつなぐだけで、元の fMP4 と同じバイト列に戻せる
# 使い方: python3 -I split_video.py <話のID> <テーマ曲入り.mp4> <環境音のみ.mp4>
# 出力: out/media/<話>/v00.mp4…（映像の断片の束、各19MiB以下）、a_theme_0.mp4…（音、各14MB以下）、out/video/<話>.json（つなぎ方）
import base64, hashlib, json, struct, subprocess, sys
from pathlib import Path

here = Path(__file__).resolve().parent
ep, src_theme, src_asmr = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
work = here / 'work'; work.mkdir(exist_ok=True)
media = here / 'out' / 'media' / ep; media.mkdir(parents=True, exist_ok=True)
for old in media.glob('*.mp4'): old.unlink()
VPART = 19 * 1024 * 1024      # 映像の束（アセット：1ファイル 20MiB まで）
APART = 14 * 1000 * 1000      # 音の束（公開ファイル：1ファイル 15MB まで）


def fragment(src, dst):
    # 映像も音も再エンコードせずに（-c copy）、キーフレームごとの断片に。各トラックに別の moof、データ位置は moof からの相対
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy',
                    '-movflags', '+frag_keyframe+empty_moov+default_base_moof+separate_moof', '-f', 'mp4', str(dst)], check=True)


def boxes(buf, start=0, end=None):
    i, end = start, len(buf) if end is None else end
    while i < end:
        size, typ = struct.unpack('>I4s', buf[i:i + 8]); hdr = 8
        if size == 1: size = struct.unpack('>Q', buf[i + 8:i + 16])[0]; hdr = 16
        elif size == 0: size = end - i
        yield typ.decode('latin1'), i, size, hdr
        i += size


def child(buf, start, size, hdr, name):
    for t, i, s, h in boxes(buf, start + hdr, start + size):
        if t == name: return i, s, h
    return None


def track_kinds(buf, moov):
    # moov の trak ごとに track_ID → 'vide'／'soun'
    kinds = {}
    for t, i, s, h in boxes(buf, moov[0] + moov[2], moov[0] + moov[1]):
        if t != 'trak': continue
        tk = child(buf, i, s, h, 'tkhd'); ver = buf[tk[0] + 8]
        tid = struct.unpack('>I', buf[tk[0] + (28 if ver == 1 else 20):][:4])[0]
        md = child(buf, i, s, h, 'mdia'); hd = child(buf, md[0], md[1], md[2], 'hdlr')
        kinds[tid] = buf[hd[0] + 16:hd[0] + 20].decode('latin1')
    return kinds


def parse(path):
    buf = path.read_bytes()
    top = list(boxes(buf))
    assert [t for t, *_ in top[:2]] == ['ftyp', 'moov'], [t for t, *_ in top[:4]]
    moov = (top[1][1], top[1][2], top[1][3]); kinds = track_kinds(buf, moov)
    head = buf[:top[1][1] + top[1][2]]
    frags, k = [], 2
    while k < len(top) and top[k][0] == 'moof':
        t, i, s, h = top[k]; t2, i2, s2, h2 = top[k + 1]
        assert t2 == 'mdat', t2
        traf = child(buf, i, s, h, 'traf'); tf = child(buf, traf[0], traf[1], traf[2], 'tfhd')
        tid = struct.unpack('>I', buf[tf[0] + 12:tf[0] + 16])[0]
        dt = child(buf, traf[0], traf[1], traf[2], 'tfdt'); ver = buf[dt[0] + 8]
        tdec = struct.unpack('>Q' if ver == 1 else '>I', buf[dt[0] + 12:dt[0] + (20 if ver == 1 else 16)])[0]
        frags.append(dict(kind=kinds[tid], start=i, end=i2 + s2, tdec=tdec))
        k += 2
    tail = buf[top[k][1]:] if k < len(top) else b''
    assert all(t in ('mfra', 'free') for t, *_ in top[k:]), [t for t, *_ in top[k:]]
    return buf, head, frags, tail


fr = {}
for ver, src in (('theme', src_theme), ('asmr', src_asmr)):
    dst = work / f'{ep}_{ver}_frag.mp4'
    fragment(src, dst)
    fr[ver] = parse(dst)
    print(ver, dst.stat().st_size, 'bytes,', len(fr[ver][2]), 'fragments')

# 映像の断片は、2つの版でまったく同じはず（同じ映像を -c copy、同じ順番・同じ番号）
vt = [f for f in fr['theme'][2] if f['kind'] == 'vide']; va = [f for f in fr['asmr'][2] if f['kind'] == 'vide']
assert len(vt) == len(va)
for a, b in zip(vt, va):
    assert fr['theme'][0][a['start']:a['end']] == fr['asmr'][0][b['start']:b['end']], 'video fragments differ'

parts, part_of = [], {}  # parts: [名前, パス, 大きさ]


def pack(prefix, frs, buf, limit):
    cur, n, f_out, off = None, 0, None, 0
    for f in frs:
        size = f['end'] - f['start']
        if f_out is None or off + size > limit:
            if f_out: f_out.close()
            name = f'{prefix}{n:02d}' if prefix == 'v' else f'{prefix}{n}'
            path = media / f'{name}.mp4'; f_out = open(path, 'wb'); parts.append([name, path]); n += 1; off = 0
        f_out.write(buf[f['start']:f['end']])
        part_of[id(f)] = (len(parts) - 1, off, size); off += size
    if f_out: f_out.close()


pack('v', vt, fr['theme'][0], VPART)
vmap = {id(b): part_of[id(a)] for a, b in zip(vt, va)}  # 環境音のみ版の映像の断片も同じ場所を指す
part_of.update(vmap)
for ver in ('theme', 'asmr'):
    pack(f'a_{ver}_', [f for f in fr[ver][2] if f['kind'] == 'soun'], fr[ver][0], APART)

man = dict(parts=[], head={}, tail={}, slices={}, size={}, sha256={}, note='')
for name, path in parts:
    man['parts'].append(dict(name=name, path=f'media/{ep}/{path.name}', size=path.stat().st_size, url=None))
for ver in ('theme', 'asmr'):
    buf, head, frs, tail = fr[ver]
    man['head'][ver] = base64.b64encode(head).decode()
    man['tail'][ver] = base64.b64encode(tail).decode()
    man['slices'][ver] = [list(part_of[id(f)]) for f in frs]
    man['size'][ver] = len(buf)
    man['sha256'][ver] = hashlib.sha256(buf).hexdigest()

# 確かめる：つなぎ方どおりに組み直すと、元の fMP4 と同じバイト列になるか
for ver in ('theme', 'asmr'):
    data = {i: Path(here / 'out' / p['path']).read_bytes() for i, p in enumerate(man['parts'])}
    out = bytearray(base64.b64decode(man['head'][ver]))
    for pi, off, ln in man['slices'][ver]: out += data[pi][off:off + ln]
    out += base64.b64decode(man['tail'][ver])
    assert hashlib.sha256(out).hexdigest() == man['sha256'][ver], ver
    print(ver, 'rebuild OK', len(out))

vj = here / 'out' / 'video'; vj.mkdir(exist_ok=True)
old = vj / f'{ep}.json'
if old.exists():  # 前に入れたアップロード先（url）は、同じ中身の束にだけ引き継ぐ
    prev = {p['name']: p for p in json.loads(old.read_text())['parts']}
    for p in man['parts']:
        q = prev.get(p['name'])
        if q and q.get('url') and q.get('size') == p['size'] and q.get('sha') == hashlib.sha256((here / 'out' / p['path']).read_bytes()).hexdigest():
            p['url'] = q['url']
for p in man['parts']:
    p['sha'] = hashlib.sha256((here / 'out' / p['path']).read_bytes()).hexdigest()
old.write_text(json.dumps(man, ensure_ascii=False), encoding='utf-8')
tot = sum(p['size'] for p in man['parts'])
print(f'{ep}: {len(man["parts"])} parts, {tot / 1e6:.1f} MB stored for both versions ({man["size"]["theme"] / 1e6:.1f} + {man["size"]["asmr"] / 1e6:.1f} MB as files)')
