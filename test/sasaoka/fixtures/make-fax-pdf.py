"""テスト用の「複合機・FAX でスキャンした PDF」を作る（介護保険証の読み取りのテスト。e2e-card.mjs）。
画像を白黒にして CCITT G4（FAX の圧縮）で入れ、ページを 270° 回す（/Rotate 270）。複合機のスキャンによくある形。
pdf.js はこの画像を描くのに WebAssembly の部品（jbig2.wasm）が要り、同梱していなかったときはページが真っ白になった（2026-10-29）。
使い方: python3 make-fax-pdf.py 出力.pdf 画像1.png [画像2.png …]（画像は架空の保険証。本物の保険証は使わない）
"""
import io
import struct
import sys

from PIL import Image

DPI = 200


def g4_strip(img):
    """白黒の画像を CCITT G4 の TIFF にして、圧縮した画素の部分（1つのストリップ）を取り出す"""
    buf = io.BytesIO()
    img.save(buf, format="TIFF", compression="group4", tiffinfo={278: img.height})  # 278＝RowsPerStrip（1つのストリップに）
    data = buf.getvalue()
    endian = "<" if data[:2] == b"II" else ">"
    (ifd,) = struct.unpack(endian + "I", data[4:8])
    (n,) = struct.unpack(endian + "H", data[ifd : ifd + 2])
    tags = {}
    for i in range(n):
        tag, typ, count, value = struct.unpack(endian + "HHII", data[ifd + 2 + i * 12 : ifd + 14 + i * 12])
        if typ == 3 and count == 1:  # SHORT は値の前半
            value = value & 0xFFFF if endian == "<" else value >> 16
        tags[tag] = value
    off, size = tags[273], tags[279]  # StripOffsets・StripByteCounts
    return data[off : off + size]


def main():
    out, *srcs = sys.argv[1:]
    objs = []  # 1 から順の番号のオブジェクト

    def add(body):
        objs.append(body)
        return len(objs)

    pages = []
    catalog = add(b"")
    tree = add(b"")
    for src in srcs:
        # PIL の白黒の TIFF（G4）は 0＝白として書くので、白黒を入れかえてから（PDF の CCITT の既定＝BlackIs1 false で、地が白に見えるように）
        img = Image.open(src).convert("L").point(lambda v: 0 if v > 160 else 255).convert("1")
        w, h = img.size
        strip = g4_strip(img)
        image = add(
            b"<< /Type /XObject /Subtype /Image /Width %d /Height %d /ColorSpace /DeviceGray /BitsPerComponent 1 "
            b"/Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns %d /Rows %d /BlackIs1 false >> /Length %d >>\nstream\n" % (w, h, w, h, len(strip))
            + strip
            + b"\nendstream"
        )
        pw, ph = w * 72 / DPI, h * 72 / DPI
        content = b"q %.2f 0 0 %.2f 0 0 cm /Im0 Do Q" % (pw, ph)
        stream = add(b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")
        page = add(
            b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.2f %.2f] /Rotate 270 /Resources << /XObject << /Im0 %d 0 R >> >> /Contents %d 0 R >>"
            % (tree, pw, ph, image, stream)
        )
        pages.append(page)
    objs[catalog - 1] = b"<< /Type /Catalog /Pages %d 0 R >>" % tree
    objs[tree - 1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (b" ".join(b"%d 0 R" % p for p in pages), len(pages))
    pdf = io.BytesIO()
    pdf.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(pdf.tell())
        pdf.write(b"%d 0 obj\n" % i + body + b"\nendobj\n")
    xref = pdf.tell()
    pdf.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1))
    for off in offsets:
        pdf.write(b"%010d 00000 n \n" % off)
    pdf.write(b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, catalog, xref))
    with open(out, "wb") as f:
        f.write(pdf.getvalue())


main()
