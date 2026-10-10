#!/bin/bash
# Gemini + Google検索（502対策で3回まで再試行）  usage: gsearch.sh prompt_file out_file [model]
m=${3:-gemini-3.8-flash}
for i in 1 2 3; do
  python3 "$(dirname "$0")/gem.py" --search --think low --model "$m" --prompt-file "$1" --out "$2" > "$2.log" 2>&1 && [ -s "$2" ] && exit 0
  sleep $((i*5))
done
exit 1
