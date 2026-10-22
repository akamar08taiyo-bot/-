#!/bin/sh
# xlsx（と印刷の PDF）を画像にして見比べる。xlsx は LibreOffice で PDF にしてから。
# usage: sh render.sh <出力フォルダ> <xlsx か pdf>...
#   → <出力フォルダ>/<名前>_xlsx-<ページ>.png ／ <名前>_pdf-<ページ>.png（同じ名前の xlsx と PDF を並べても上書きしない）。ページ数も表示する
# 要るもの：LibreOffice（soffice）と poppler-utils（pdftoppm・pdfinfo）
OUT=${1:?出力フォルダ}; shift
mkdir -p "$OUT"
for f in "$@"; do
  base=$(basename "$f"); name=${base%.*}
  case "$f" in
    *.xlsx)
      timeout 300 soffice --headless --convert-to pdf "$f" --outdir "$OUT" > /dev/null 2>&1
      pdf="$OUT/$name.pdf"; tag="${name}_xlsx" ;;
    *.pdf) pdf="$f"; tag="${name}_pdf" ;;
    *) echo "わからない: $f"; continue ;;
  esac
  [ -f "$pdf" ] || { echo "PDF にできなかった: $f"; continue; }
  echo "$tag: $(pdfinfo "$pdf" 2>/dev/null | awk '/^Pages:/{print $2}') ページ"
  pdftoppm -r 80 -png "$pdf" "$OUT/$tag"
done
ls "$OUT"/*.png
