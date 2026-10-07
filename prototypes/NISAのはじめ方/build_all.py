"""はじめ方アプリの4ページを、サイト用（okane-site-out）とプレビュー用（okane-preview）に書き出す。
プレビュー用のページには、プレビュー専用の preview.css・preview.js を足す（実際のサイトには入れない）。"""
import pathlib
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).parent
# 使い方：python3 build_all.py [サイトのフォルダ] [プレビューのフォルダ]
# サイトのフォルダ＝おかねの地図のサイト一式（okane-no-chizu-website-v5.zip を展開したもの）
SITE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parent / "okane-site-out"
PREVIEW = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else HERE.parent / "okane-preview"
PAGES = ["start.html", "goal.html", "choose.html", "support.html"]
ASSETS = ["goal.js", "start.css", "start.js", "choose.js", "support.js", "broker-config.js", "video.js", "video.css", "gift-videos.js", "partners.js"]


def main():
    subprocess.run([sys.executable, str(HERE / "build_pages.py"), str(SITE)], check=True)
    for name in ASSETS:
        shutil.copyfile(HERE / name, SITE / name)
    if not PREVIEW.exists():
        print("プレビューのフォルダがないので、サイト用だけ書き出しました")
        return
    for name in ASSETS:
        shutil.copyfile(HERE / name, PREVIEW / name)
    # プレビューは1ファイル15MBまでなので、特典2の動画は1章を3つに分けたファイルの一覧を使う
    shutil.copyfile(HERE / "gift-videos.preview.js", PREVIEW / "gift-videos.js")
    for page in PAGES:
        html = (SITE / page).read_text(encoding="utf-8")
        html = html.replace('<link rel="stylesheet" href="start.css">\n',
                            '<link rel="stylesheet" href="start.css">\n<link rel="stylesheet" href="preview.css">\n', 1)
        head, rest = html.split("</head>", 1)
        head = head.rstrip("\n") + '\n<script defer src="preview.js"></script>\n'
        (PREVIEW / page).write_text(head + "</head>" + rest, encoding="utf-8")
        print("preview", page)


if __name__ == "__main__":
    main()
