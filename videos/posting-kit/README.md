# 記憶の路地裏 投稿キット

「AIと人間の共存」の各話を YouTube に載せるための一式（動画・タイトル・概要欄・サムネイル・タグ・台本・アップロード時の設定）を、話ごとのページにまとめた Artifact の元。

- 公開先（非公開。見せるときはページの共有メニューから）：https://claude.ai/artifact/MwTV3wKkDXAHpeEJxLpw29
- 文の元：`../ai-human-coexistence/docs/youtube_description.txt`（第一章）、`youtube_ch2.txt`（第二章）。目次の時刻は各話の `src/timeline.json` から計算し直す
- 台本：第一章は `docs/theme.md`、第二章は `docs/chapter2_script.md`

## 作り方

```bash
python3 -I split_video.py ep2 ../ai-human-coexistence-2/out/ai_human_coexistence_2_theme.mp4 ../ai-human-coexistence-2/out/ai_human_coexistence_2_asmr.mp4
# out/media/ep2/v*.mp4 を Artifact の保存場所へアップロード → 対応表を set_urls.py へ
python3 -I set_urls.py ep2 < urls.txt
python3 -I build_kit.py      # → out/kit.html（試写の 480p は各話の out/mini_*_480p.mp4 を分けて out/preview/ へ）
```

公開するファイル：`out/kit.html`（ページ）、`out/thumbs/*.jpg`、`out/media/<話>/a_*.mp4`（音の束）、`out/preview/*.mp4`（試写）。capabilities は `{downloads: true, assets: {}}`。

## 動画の置き方

テーマ曲入りと環境音のみは映像がまったく同じなので、断片化 MP4 にして映像の断片を1組だけ持ち、音の断片を版ごとに持つ。ページは頭（ftyp＋moov）→ 断片を元の順に → 終わり（mfra）をつなぎ、元の fMP4 と同じバイト列に戻してから保存する（`out/video/<話>.json` の sha256 と一致することを確かめてある）。映像・音とも再エンコードしていないので、画質は仕上がりの MP4 と同じ。

- Artifact の保存場所（assets）は 1GiB まで：第一章・第二章の映像の束（第一章 約480MB・27個、第二章 約300MB・16個。合わせて約790MB）
- ページのファイルは 256MB まで：音の束（各話・各版 約15MB）、試写、サムネイル
