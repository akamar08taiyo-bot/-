#!/usr/bin/env node
// 画像生成の予備ルート（OpenAI Images API）。普段は Codex のイメージ生成を使い、Codex の利用枠が切れたときにこちらを使う。
// 使い方: node scripts/image-generate.mjs --prompt "説明" --out out.png [--size 1536x1024|1024x1024|1024x1536]
// 必要な環境変数: OPENAI_API_KEY（モデルは OPENAI_IMAGE_MODEL で変更可）
import OpenAI from 'openai';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    prompt: { type: 'string' },
    out: { type: 'string', default: 'image.png' },
    size: { type: 'string', default: '1536x1024' },
  },
});
if (!values.prompt) {
  console.error('使い方: node scripts/image-generate.mjs --prompt "説明" --out out.png [--size 1536x1024]');
  process.exit(2);
}

const client = new OpenAI();
try {
  const res = await client.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1',
    prompt: values.prompt,
    size: values.size,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('画像データが返ってきませんでした');
  writeFileSync(values.out, Buffer.from(b64, 'base64'));
  console.log(`保存しました: ${values.out}（文字崩れの確認: node scripts/judge-image.mjs ${values.out}）`);
} catch (error) {
  if (error instanceof OpenAI.APIError) console.error(`OpenAI API エラー ${error.status}: ${error.message}`);
  else console.error(error);
  process.exit(3);
}
