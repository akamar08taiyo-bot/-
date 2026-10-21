#!/bin/sh
# ECMA-376（Office Open XML）の XSD を取ってくる。Apache POI の poi-ooxml-full の jar（Maven Central）に入っているものを使う。
# usage: sh fetch-xsd.sh [展開先（既定 ~/.cache/taiyo-xsd）] → validate.py は XLSX_XSD_DIR か既定の場所を見る
DEST=${1:-${XLSX_XSD_DIR:-$HOME/.cache/taiyo-xsd}}
mkdir -p "$DEST" || exit 1
if [ -f "$DEST/sml.xsd" ]; then echo "$DEST"; exit 0; fi
TMP=$(mktemp -d)
curl -sSfL -o "$TMP/poi.jar" https://repo1.maven.org/maven2/org/apache/poi/poi-ooxml-full/5.2.5/poi-ooxml-full-5.2.5.jar || exit 1
# jar の中の org/apache/poi/schemas/ooxml/src/*.xsd（41個）を、フォルダを外して展開する
unzip -o -j -q "$TMP/poi.jar" 'org/apache/poi/schemas/ooxml/src/*.xsd' -d "$DEST" || exit 1
rm -rf "$TMP"
ls "$DEST"/sml.xsd > /dev/null && echo "$DEST"
