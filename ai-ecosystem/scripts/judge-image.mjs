#!/usr/bin/env node
// 画像の見た目判定（OpenAI Vision API）。ジェブはテキストしか読めないので、画像の判断はここに任せる。
// - 崩れた文字・誤字がないか（画像生成でよく起きる）
// - 個人情報（メール・電話・住所・顔・通知・APIキーなど）が写っていないか → モザイクが必要な範囲を返す
// - 図の矢印や線が要素につながっているか、はみ出し・重なりがないか
// - AIっぽい見た目になっていないか
//
// 使い方: node scripts/judge-image.mjs --task "この画像の目的" 画像1.png [画像2.jpg ...]
// 終了コード: 0=PASS, 1=FAIL, 2=使い方の誤り, 3=APIエラー
import OpenAI from 'openai';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { task: { type: 'string', default: '' }, help: { type: 'boolean', short: 'h' } },
});
if (values.help || positionals.length === 0) {
  console.error('使い方: node scripts/judge-image.mjs --task "画像の目的" 画像.png [画像2.png ...]');
  process.exit(2);
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const images = positionals.map((p) => {
  const mime = MIME[path.extname(p).toLowerCase()];
  if (!existsSync(p) || !mime) {
    console.error(`画像が見つからないか、対応していない形式です: ${p}`);
    process.exit(2);
  }
  return { type: 'image_url', image_url: { url: `data:${mime};base64,${readFileSync(p).toString('base64')}` } };
});

const SYSTEM = `あなたは画像の検品係です。日本語の資料・サムネイル・図・動画の静止画を確認し、JSONだけで答えてください。
確認すること:
1. text: 画像内の文字が崩れていないか、誤字や意味不明な文字列がないか（日本語の字形の崩れに特に注意）
2. pii: 個人情報（メールアドレス、電話番号、住所、人の顔、通知の中身、顧客名、APIキーやパスワード）が写っていないか
3. diagram: 矢印や線が要素にきちんとつながっているか、向きで流れが読めるか
4. layout: 文字や要素のはみ出し・重なり・小さすぎる文字がないか
5. style: 紫〜ピンクのグラデーション、絵文字の多用など「いかにもAI」な見た目になっていないか
問題が1つでもあれば verdict は "FAIL" です。
形式:
{"verdict":"PASS"|"FAIL","issues":[{"image":<0始まりの番号>,"type":"text"|"pii"|"diagram"|"layout"|"style","location":"どこか（言葉で）","bbox":[x,y,w,h] または null（画像幅・高さに対する0〜1の割合）,"detail":"何が問題か","fix":"どう直すか"}],"summary":"全体の一言"}`;

const client = new OpenAI(); // OPENAI_API_KEY を使う
try {
  const res = await client.chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL ?? 'gpt-5',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [{ type: 'text', text: `画像の目的: ${values.task || '（指定なし）'}\n画像の順番: ${positionals.join(', ')}` }, ...images],
      },
    ],
  });
  const verdict = JSON.parse(res.choices[0].message.content ?? '{}');
  console.log(JSON.stringify({ model: res.model, files: positionals, ...verdict }, null, 2));
  process.exit(verdict.verdict === 'PASS' ? 0 : 1);
} catch (error) {
  if (error instanceof OpenAI.APIError) console.error(`OpenAI API エラー ${error.status}: ${error.message}`);
  else console.error(error);
  process.exit(3);
}
