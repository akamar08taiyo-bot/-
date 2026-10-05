# 動画づくり（完成動画を、制度ごとの短い動画に分ける）

偉人編「知らないと損する制度」の完成動画5本を、制度ごとの短い動画19本に分けるための道具です（2026年10月5日）。入口のページ（`../index.html`）の「動画で見る」で使っています。動画そのもの（mp4）はリポジトリに入れていません。

| ファイル | 中身 |
|---|---|
| `clips.py` | 分け方の表。どの動画の何秒から何秒か、いつの制度か（2026年度の改正／2027年度の改正／いつでも役立つ）、だれ向けか、ポイント、やること。`../make_index.py` もこの表を読む |
| `make_clips.py` | 表のとおりに切り出して、`out/clips/*.mp4`（720×1280・H.264/AAC）と `out/posters/*.webp` を作る |
| `audio_level.py` | 音の大きさを10ミリ秒ごとに出す（切れ目さがしと、終わりの音を消す長さ） |
| `detect.py`・`sheet.py` | 字幕の吹き出しと順位の見出しが切り替わる時刻を出す／その時刻の画面を1枚に並べて確かめる |

## 作り直し方

1. 完成動画を、動画一覧の Artifact（https://claude.ai/artifact/88Bki2FczPnw7y4fV4iZnx）から `src/videos/{kaisei1p,kaisei2p,seido1p,seido2p,seido3p}_duo.mp4` と `src/thumbs/同じ名前.jpg` に保存する。
2. 動画を作り直したとき（例：消費税1%と就業者負担軽減支援金の法律が成立して、改正編2を直したとき）は、`python3 detect.py src/videos/kaisei2p_duo.mp4` と `sheet.py` で区切りを確かめて、`clips.py` の start・end・poster を直す。
3. `python3 make_clips.py`（一部だけなら `python3 make_clips.py k2-3 k2-4`）。
4. `python3 ../make_index.py` で入口のページを作り直す。
5. 公開するときの置き場所：`out/clips/*.mp4` → `video/clips/`、`out/posters/*.webp` → `video/posters/`、`src/videos/{名前}_duo.mp4` → `video/full/{名前}.mp4`。

## 分け方の決まり

- 切る位置は、字幕の切り替わりと音のすき間。始まりは「次の話題の画面と声が出る直前」にする。
- 乱入（瓦版・のぼり旗など）の途中で前の話題の画面が残っている所は、短い動画に入れない（通しの動画では見られる）。
- TOP5の動画は、4位が1〜2文と短いので、5位と1本にまとめる。それぞれの最初の1本には、つかみの2行も入れる。
- 締め（おかねの地図・プロフィールのリンク）は短い動画に入れない。
- 画質は元の動画とほぼ同じ（CRF 26・キーフレーム150）。音は、終わりを0.04〜0.15秒かけて消す。

## 制度ガイドの動画（1本1制度）に入れ替える

制作セッションが作る「制度ガイドの動画」16本（台本は `台本/gift_eps.py`）は、「いつの制度」ごとに全部そろったら、切り出し動画と入れ替わります。

1. 動画一覧の Artifact から `videos/gNN_duo.mp4` と `thumbs/gNN_duo.jpg` を `guide_src/` に保存する。
2. `python3 import_guide.py`（長さを `guide_ready.json` に書き、カード用のポスターを `out/posters/gNN.webp` に作る）。
3. `python3 ../make_index.py`。そろった時期だけ新しい動画になる。
4. 公開するときの置き場所：動画は動画一覧からサーバー側でコピー（`video/guide/gNN.mp4` ← `videos/gNN_duo.mp4`）、ポスターは `video/posters/gNN.webp`。
