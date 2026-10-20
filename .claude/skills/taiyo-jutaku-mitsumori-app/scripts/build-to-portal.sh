#!/bin/sh
# 見積書・請求書アプリを2つともビルドし、太陽ポータル（taiyo-portal）の2つのフォルダに置く（commit・push はしない）。
# usage: sh build-to-portal.sh [アプリのリポジトリ（既定 /home/user/-）] [taiyo-portal（既定 /home/user/taiyo-portal）]
set -e
REPO=${1:-/home/user/-}
PORTAL=${2:-/home/user/taiyo-portal}
cd "$REPO"
npm run -s build:sasaoka
npm run -s build:jutaku
# ビルドで書きかわることがある（依存を変えていなければ戻す）
git checkout -- package-lock.json 2>/dev/null || true
cp dist-sasaoka/index.html dist-sasaoka/version.json "$PORTAL/sasaoka/"
cp dist-jutaku/index.html dist-jutaku/version.json "$PORTAL/jutaku-mitsumori/"
echo "置きました：$PORTAL/sasaoka/ と $PORTAL/jutaku-mitsumori/（version.json: $(cat dist-jutaku/version.json)）"
