"""Gemini API の共通設定。

クラウド環境でプロキシがキーを付ける場合は何もしなくてよい。
ローカルでは環境変数 GEMINI_API_KEY を入れておくと x-goog-api-key ヘッダーで送る（キーは表示しない）。
"""
import os

BASE = "https://generativelanguage.googleapis.com/v1beta"
HEADERS = {"Content-Type": "application/json"}
if os.environ.get("GEMINI_API_KEY"):
    HEADERS["x-goog-api-key"] = os.environ["GEMINI_API_KEY"]
