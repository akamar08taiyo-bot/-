#!/usr/bin/env node
// ナレーション音声を ElevenLabs の API で作る（動画スキル用）。
// 使い方: node scripts/tts-elevenlabs.mjs (--text "読み上げる文" | --file 原稿.txt) --out narration.mp3 [--voice <voice_id>]
// 必要な環境変数: ELEVENLABS_API_KEY、ELEVENLABS_VOICE_ID（--voice で上書き可）
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    text: { type: 'string' },
    file: { type: 'string' },
    out: { type: 'string', default: 'narration.mp3' },
    voice: { type: 'string' },
  },
});

const text = values.text ?? (values.file ? readFileSync(values.file, 'utf8') : '');
const voice = values.voice ?? process.env.ELEVENLABS_VOICE_ID;
const key = process.env.ELEVENLABS_API_KEY;
if (!text.trim() || !voice || !key) {
  console.error('読み上げる文（--text か --file）、声のID（ELEVENLABS_VOICE_ID か --voice）、ELEVENLABS_API_KEY が必要です。');
  process.exit(2);
}

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
  method: 'POST',
  headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
  body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL ?? 'eleven_multilingual_v2' }),
});
if (!res.ok) {
  console.error(`ElevenLabs API エラー ${res.status}: ${await res.text()}`);
  process.exit(3);
}
writeFileSync(values.out, Buffer.from(await res.arrayBuffer()));
console.log(`保存しました: ${values.out}`);
