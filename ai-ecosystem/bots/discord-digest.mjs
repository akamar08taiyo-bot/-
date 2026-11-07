#!/usr/bin/env node
// Discord ボット（チーム共有の Discord 用）: 指定チャンネルの直近のやり取りを読み、
// 「今日のタスク一覧・決まったこと・要対応・保留」のレポートにまとめて、報告用チャンネルに投稿する。
// 報告用チャンネルは、本人とパートナーだけが見られる非公開チャンネルにしておく（権限は Discord 側で設定）。
//
// 使い方: node bots/discord-digest.mjs [--dry-run] [--hours 24]
//   --dry-run  投稿せずに標準出力へ表示（daily-digest スキルから呼ぶときはこちら）
// 必要な環境変数:
//   DISCORD_BOT_TOKEN          ボットのトークン（1Password 経由で渡す）
//   DISCORD_CHANNEL_IDS        読むチャンネルのID（カンマ区切り）
//   DISCORD_REPORT_CHANNEL_ID  レポートを投稿するチャンネルのID（--dry-run なら不要）
//   OBSIDIAN_VAULT             （任意）設定するとレポートを Obsidian の日次メモにも保存
import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { 'dry-run': { type: 'boolean', default: false }, hours: { type: 'string', default: '24' } },
});
const dryRun = values['dry-run'];
const hours = Number(values.hours) || 24;

const token = process.env.DISCORD_BOT_TOKEN;
const channelIds = (process.env.DISCORD_CHANNEL_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const reportChannel = process.env.DISCORD_REPORT_CHANNEL_ID;
if (!token || channelIds.length === 0 || (!dryRun && !reportChannel)) {
  console.error('DISCORD_BOT_TOKEN、DISCORD_CHANNEL_IDS、（投稿する場合は）DISCORD_REPORT_CHANNEL_ID を設定してください。');
  process.exit(2);
}

const API = 'https://discord.com/api/v10';
async function discord(pathname, init = {}) {
  const res = await fetch(API + pathname, {
    ...init,
    headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 429) {
    const wait = Number((await res.json()).retry_after ?? 1) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return discord(pathname, init);
  }
  if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);
  return res.json();
}

// 直近 hours 時間のメッセージを、新しい順にページをたどって集める
const since = Date.now() - hours * 3600 * 1000;
const transcript = [];
for (const id of channelIds) {
  const channel = await discord(`/channels/${id}`);
  const collected = [];
  let before;
  for (let page = 0; page < 20; page++) {
    const batch = await discord(`/channels/${id}/messages?limit=100${before ? `&before=${before}` : ''}`);
    if (batch.length === 0) break;
    const fresh = batch.filter((m) => Date.parse(m.timestamp) >= since);
    collected.push(...fresh);
    if (fresh.length < batch.length) break;
    before = batch[batch.length - 1].id;
  }
  collected.reverse();
  const lines = collected
    .filter((m) => !m.author?.bot && (m.content || m.attachments?.length))
    .map((m) => {
      const t = new Date(m.timestamp).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
      const files = m.attachments?.length ? ` [添付${m.attachments.length}件]` : '';
      return `${t} ${m.author?.global_name ?? m.author?.username}: ${m.content}${files}`;
    });
  transcript.push(`## #${channel.name ?? id}\n${lines.join('\n') || '（やり取りなし）'}`);
}

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
const client = process.env.JUDGE_ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.JUDGE_ANTHROPIC_API_KEY })
  : new Anthropic();

const response = await client.beta.messages.create({
  model: process.env.DIGEST_MODEL ?? 'claude-opus-5-5',
  max_tokens: 16000,
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
  output_config: { effort: 'medium' },
  system:
    'あなたはチームの秘書です。Discord のやり取りから、事実だけを使って日本語の日次レポートを作ります。' +
    '推測で担当や期限を決めず、不明なものは「要確認」と書きます。前置きやあいさつは書きません。' +
    '形式: 「## 今日のタスク一覧」（優先順、担当・期限つき）「## 決まったこと」「## 要対応・返事待ち」「## 保留」「## 共有メモ」。該当がなければ「なし」。',
  messages: [{ role: 'user', content: `日付: ${today}（直近${hours}時間）\n\n${transcript.join('\n\n')}` }],
});
if (response.stop_reason === 'refusal') {
  console.error('要約を断られました:', response.stop_details?.explanation ?? '');
  process.exit(3);
}
const report = `# ${today} Discord まとめ\n\n` + response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');

if (process.env.OBSIDIAN_VAULT) {
  const dir = path.join(process.env.OBSIDIAN_VAULT, 'daily');
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, `${today}.md`), `\n${report}\n`);
}

if (dryRun) {
  console.log(report);
} else {
  // Discord の1メッセージは2000文字まで。行単位で分けて送る
  const chunks = [];
  let buf = '';
  for (const line of report.split('\n')) {
    if ((buf + line + '\n').length > 1900) {
      chunks.push(buf);
      buf = '';
    }
    buf += line + '\n';
  }
  if (buf.trim()) chunks.push(buf);
  for (const content of chunks) {
    await discord(`/channels/${reportChannel}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
  }
  console.log(`投稿しました（${chunks.length}件）`);
}
