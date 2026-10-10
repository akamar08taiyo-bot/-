#!/bin/bash
# 明朝体（しっぽり明朝、SIL Open Font License）を用意する。題字・キャプション・サムネイルに使う。
#   bash setup_fonts.sh <作品フォルダ>/assets/fonts
# npm のパッケージ（@expo-google-fonts/shippori-mincho）から取り出す。だめなら Google Fonts の GitHub から。
set -e
DEST=${1:?usage: setup_fonts.sh <fonts dir>}
mkdir -p "$DEST"
if [ -s "$DEST/ShipporiMincho_400Regular.ttf" ] && [ -s "$DEST/ShipporiMincho_500Medium.ttf" ]; then echo "fonts already in $DEST"; exit 0; fi
TMP=$(mktemp -d)
ok=0
if command -v npm >/dev/null 2>&1; then
  ( cd "$TMP" && npm pack @expo-google-fonts/shippori-mincho >/dev/null 2>&1 && tar xzf expo-google-fonts-shippori-mincho-*.tgz ) && \
  for w in 400Regular 500Medium; do
    f=$(find "$TMP/package" -name "ShipporiMincho_${w}.ttf" | head -1); [ -n "$f" ] && cp "$f" "$DEST/"
  done
  [ -s "$DEST/ShipporiMincho_400Regular.ttf" ] && [ -s "$DEST/ShipporiMincho_500Medium.ttf" ] && ok=1
fi
if [ $ok = 0 ]; then
  base=https://github.com/google/fonts/raw/main/ofl/shipporimincho
  curl -fsSL "$base/ShipporiMincho-Regular.ttf" -o "$DEST/ShipporiMincho_400Regular.ttf" && \
  curl -fsSL "$base/ShipporiMincho-Medium.ttf" -o "$DEST/ShipporiMincho_500Medium.ttf" && ok=1
fi
rm -rf "$TMP"
if [ $ok = 1 ]; then echo "fonts -> $DEST"; ls -la "$DEST"; else echo "フォントを取得できませんでした。しっぽり明朝の Regular / Medium の ttf を $DEST に ShipporiMincho_400Regular.ttf / ShipporiMincho_500Medium.ttf の名前で置いてください"; exit 1; fi
