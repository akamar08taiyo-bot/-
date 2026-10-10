#!/usr/bin/env node
// 制作に使う道具がそろっているかを調べる：Node・ffmpeg（drawtext）・日本語の書体・Gemini（キーと課金）
//   node check.mjs [--no-gemini]
// Gemini は「テスト」の 2 文字を音声合成して確かめる（費用はごくわずか）。
import { parseArgs, versionOf, run, viaProxy, ensureProxy } from './lib/common.mjs';
import { findFont } from './lib/media.mjs';
import { API, geminiPost, authHeaders } from './lib/gemini.mjs';

ensureProxy();
const args = parseArgs(process.argv.slice(2), { flags: ['no-gemini'] });
const rows = [];
const add = (ok, item, detail) => rows.push(`${ok ? '✓' : '✗'} ${item} — ${detail}`);

const major = Number(process.versions.node.split('.')[0]);
add(major >= 18, 'Node', `${process.version}${major >= 18 ? '' : '（18 以上が必要）'}`);
const ff = versionOf('ffmpeg', ['-hide_banner', '-version']);
const filters = ff ? run('ffmpeg', ['-hide_banner', '-filters']).stdout : '';
add(Boolean(ff), 'ffmpeg', ff ? ff.split(' ').slice(0, 3).join(' ') : '未導入（Windows：winget install ffmpeg ／ Linux：apt-get install -y ffmpeg）');
if (ff) {
  const need = ['zoompan', 'xfade', 'drawtext', 'loudnorm', 'vignette', 'colorbalance'];
  const miss = need.filter((f) => !new RegExp(`\\s${f}\\s`).test(filters));
  add(!miss.length, 'ffmpeg のフィルタ', miss.length ? `足りない：${miss.join(', ')}（drawtext が無い版はテロップが出せない。公式の full 版を入れる）` : 'そろっている');
}
for (const [kind, label] of [
  ['mincho', '明朝体（テロップ・タイトル）'],
  ['gothic', 'ゴシック体'],
  ['mono', '等幅（日付スタンプ）'],
]) {
  const f = findFont(kind, process.cwd());
  add(Boolean(f), label, f || '見つからない（Linux：apt-get install -y fonts-ipafont-mincho fonts-ipafont-gothic）');
}
if (!args['no-gemini']) {
  const auth = authHeaders();
  if (!auth) add(false, 'Gemini', 'キーが見つからない（画像・声・BGM の生成に必要。作業フォルダの .env に GEMINI_API_KEY を書いてもらう）');
  else {
    const r = await geminiPost(
      `${API}/models/gemini-3.8-flash-tts:generateContent`,
      { contents: [{ parts: [{ text: 'テスト' }] }], generationConfig: { responseModalities: ['AUDIO'] } },
      { timeoutMs: 60000, tries: 1 },
    );
    add(r.ok, 'Gemini（キー・課金）', r.ok ? `OK（キー：${auth.from}）` : r.error.split('\n')[0]);
  }
}
console.log(rows.join('\n'));
if (viaProxy()) console.log('\n（クラウドの作業環境：作った動画は会話に送るか、ユーザーの PC に戻す。コンテナは時間がたつと消える）');
if (rows.some((r) => r.startsWith('✗'))) process.exitCode = 2;
