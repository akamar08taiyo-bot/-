// テストのあいだだけ、太陽ポータルと同じ形のサイトのフォルダを http://localhost:5190 で配信し、うしろに書いたコマンドを動かして、終わったら止める。
// （作業環境の常駐のサーバーは時間制限で止められるため）
// usage: node serve.mjs <サイトのフォルダ> <コマンド> [引数…]
//   例：node serve.mjs /tmp/site node test/sasaoka/e2e-sheet.mjs http://localhost:5190 /tmp/out
//   サイトのフォルダ：sasaoka/・jutaku-mitsumori/（見積書・請求書アプリの2つのビルド）、taiyo-hacchu-scan/（販売受注簿作成ツールの docs/）
import {spawn} from 'node:child_process';
import {createReadStream, statSync} from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [root, ...cmd] = process.argv.slice(2);
if (!root || cmd.length === 0) {
  console.error('usage: node serve.mjs <サイトのフォルダ> <コマンド> [引数…]');
  process.exit(2);
}
const PORT = Number(process.env.PORT ?? 5190);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};
const server = http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    if (statSync(f).isDirectory()) f = path.join(f, 'index.html');
    statSync(f);
  } catch {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, {'content-type': types[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store'});
  createReadStream(f).pipe(res);
});
server.listen(PORT, () => {
  const child = spawn(cmd[0], cmd.slice(1), {stdio: 'inherit'});
  child.on('exit', (code) => {
    server.close();
    process.exit(code ?? 1);
  });
});
