#!/bin/sh
# app.html（中身だけのHTML断片）を、単体で配信できる index.html に組み立てる。
# Claude Artifact は head を自動で付けるが、Netlify や GitHub Pages では自前で必要になる。
set -e
dir=$(dirname "$0")
{
  cat "$dir/head.html"
  cat "$dir/app.html"
  printf '\n</body>\n</html>\n'
} > "$dir/index.html"
echo "built: $dir/index.html"
