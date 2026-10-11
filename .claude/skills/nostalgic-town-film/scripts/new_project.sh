#!/bin/bash
# 新しい作品の作業フォルダを作る：ひな形の複製、フォントの導入、npm の依存、道具の確認
# 使い方: bash new_project.sh <作業フォルダ> [slug]
#   slug は出力の名前（out/<slug>_theme.mp4）。省略時はフォルダ名（- は _ に）
set -euo pipefail
skill=$(cd "$(dirname "$0")/.." && pwd)
dest=${1:?使い方: bash new_project.sh <作業フォルダ> [slug]}
slug=${2:-$(basename "$dest" | tr -- '-' '_')}

if [ -d "$dest" ] && [ -n "$(ls -A "$dest")" ]; then
  echo "中身のあるフォルダには作れません: $dest" >&2; exit 1
fi
mkdir -p "$dest"
dest=$(cd "$dest" && pwd)
cp -a "$skill/assets/template/." "$dest/"
mkdir -p "$dest"/{work/genlogs,work/veoaudio,work/stills,out/shots,public/clips,assets/gen,assets/veo,audio/out,docs}
python3 - "$dest/src/timeline.json" "$slug" <<'EOF'
import json, sys
p, slug = sys.argv[1], sys.argv[2]
raw = open(p, encoding='utf-8').read()
old = json.loads(raw)['slug']
open(p, 'w', encoding='utf-8').write(raw.replace(f'"slug": "{old}"', f'"slug": "{slug}"', 1))
EOF
echo "ひな形を複製: $dest（slug: $slug）"

# フォント：システムフォントとして入れる（ブラウザでの読み込みは並列の書き出しで固まったため）
# （pipefail の下で「… | grep -q」は早く終わった grep が前のコマンドを SIGPIPE で落とし、誤って失敗になるので、出力を変数に取ってから調べる）
fonts=$(fc-list : family 2>/dev/null || true)
if grep -q "Zen Old Mincho" <<<"$fonts" && grep -q "Zen Maru Gothic" <<<"$fonts"; then
  echo "フォント: 導入済み"
else
  fontdir=/usr/local/share/fonts/zen
  if ! mkdir -p "$fontdir" 2>/dev/null || [ ! -w "$fontdir" ]; then fontdir="$HOME/.local/share/fonts/zen"; mkdir -p "$fontdir"; fi
  cp "$skill"/assets/fonts/*.ttf "$fontdir/"
  fc-cache -f "$fontdir" >/dev/null
  echo "フォント: $fontdir に導入"
fi

# npm（Remotion などは版を固定してある）
(cd "$dest" && { npm ci --no-audit --no-fund --loglevel=error || npm install --no-audit --no-fund --loglevel=error; })
echo "npm: 導入済み"

# 粒子・紙の質感（ひな形に入っているが、無ければ作る）
[ -f "$dest/public/tex/grain0.png" ] || python3 -I "$dest/scripts/make_textures.py"

# 道具の確認（足りなければ一覧にして最後に表示。作業フォルダはそのまま使える）
missing=()
command -v ffmpeg >/dev/null || missing+=("ffmpeg")
command -v ffprobe >/dev/null || missing+=("ffprobe")
if command -v ffmpeg >/dev/null; then
  filters=$(ffmpeg -hide_banner -filters 2>/dev/null || true)
  for f in rubberband minterpolate xfade ebur128; do
    grep -qw -- "$f" <<<"$filters" || missing+=("ffmpeg のフィルター $f")
  done
  encoders=$(ffmpeg -hide_banner -encoders 2>/dev/null || true)
  grep -qw libx264 <<<"$encoders" || missing+=("ffmpeg の libx264")
fi
command -v fluidsynth >/dev/null || missing+=("fluidsynth（テーマ曲）")
[ -f /usr/share/sounds/sf2/FluidR3_GM.sf2 ] || missing+=("/usr/share/sounds/sf2/FluidR3_GM.sf2（テーマ曲の音色。apt の fluid-soundfont-gm）")
py_missing=$(python3 -I - <<'EOF'
import importlib.util
mods = {'numpy': 'numpy', 'scipy': 'scipy', 'soundfile': 'soundfile', 'pyloudnorm': 'pyloudnorm',
        'cv2': 'opencv-python-headless', 'pretty_midi': 'pretty_midi', 'PIL': 'pillow'}
print(' '.join(pkg for m, pkg in mods.items() if importlib.util.find_spec(m) is None))
EOF
)
[ -z "$py_missing" ] || missing+=("Python: pip install $py_missing")
browser=$(cd "$dest" && node --input-type=module -e "import('./scripts/browser.mjs').then(m => console.log(m.browserExecutable ?? ''))")
if [ -n "$browser" ]; then echo "書き出し用ブラウザ: $browser"; else missing+=("書き出し用ブラウザ（REMOTION_BROWSER に Chrome Headless Shell の場所を入れる。無ければ Remotion が自分でダウンロードを試みる）"); fi

if [ -n "${GEMINI_API_KEY:-}" ]; then echo "Gemini: 環境変数 GEMINI_API_KEY を使う"
elif [ -n "${HTTPS_PROXY:-}${https_proxy:-}" ]; then echo "Gemini: 通信の中継が鍵を足す前提（402 なら残高切れ）"
else missing+=("Gemini の鍵（GEMINI_API_KEY）"); fi

echo
if [ ${#missing[@]} -eq 0 ]; then
  echo "準備完了。"
else
  echo "足りないもの:"; for m in "${missing[@]}"; do echo "  - $m"; done
fi
cat <<EOF

次の手順:
  cd "$dest"
  1. docs/ に分析書とテーマ設定書（例: スキルの assets/examples/）
  2. assets/gen/prompts.json に原画の指示 → python3 -I scripts/gen_image.py <ID> --refs ...
  3. assets/veo/prompts.json に動きの指示 → python3 -I scripts/veo_batch.py <ID>...
  4. src/timeline.json を自分の構成に書き換える（今入っているのは「AIと人間の共存 第一章」の実例）
EOF
