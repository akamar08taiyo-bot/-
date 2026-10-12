# Gemini API の鍵の扱い（各スクリプトが最初に import する）。
# - Claude Code のクラウド環境では、通信の中継（プロキシ）が鍵を足すので、ここでは何もしない
# - 手元の PC など中継のない所では、環境変数 GEMINI_API_KEY に鍵を入れておく。鍵は表示も保存もしない
# - 鍵は googleapis.com 宛ての要求にだけ付け、転送（リダイレクト）先には渡さない
import os
import urllib.request


class _AddKey(urllib.request.BaseHandler):
    def __init__(self, key):
        self.key = key

    def https_request(self, req):
        host = (req.host or '').split(':')[0]
        if host == 'googleapis.com' or host.endswith('.googleapis.com'):
            req.add_unredirected_header('x-goog-api-key', self.key)
        return req


if os.environ.get('GEMINI_API_KEY'):
    urllib.request.install_opener(urllib.request.build_opener(_AddKey(os.environ['GEMINI_API_KEY'])))
