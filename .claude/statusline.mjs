#!/usr/bin/env node
// ステータスライン: Claude Code の画面の下に、週間と5時間の利用制限を常に表示する。
// Claude Code が標準入力に渡す JSON の rate_limits（Pro / Max / Ultra の契約で、最初の返答のあとに入る）を読む。
// 環境変数 OBSIDIAN_VAULT があれば、同じ内容を「Claude/利用状況.md」に書き出す（保管庫を携帯と同期すれば携帯でも見られる）。
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  input = {};
}

const color = process.env.NO_COLOR ? false : true;
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const tone = (pct) => (pct >= 80 ? '31' : pct >= 50 ? '33' : '32'); // 赤・黄・緑

function bar(pct, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return '■'.repeat(filled) + '□'.repeat(width - filled);
}

const fmtWeekday = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('ja-JP', { hour: 'numeric', minute: '2-digit' });
const fmtNow = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const resetText = (epoch, long) => (typeof epoch === 'number' ? (long ? fmtWeekday : fmtTime).format(new Date(epoch * 1000)) : '');

const limits = input.rate_limits || {};
const week = limits.seven_day;
const five = limits.five_hour;
const model = input.model?.display_name || '';

const parts = [];
if (model) parts.push(model);
if (week && typeof week.used_percentage === 'number') {
  const pct = Math.round(week.used_percentage);
  const reset = resetText(week.resets_at, true);
  parts.push(`週 ${paint(tone(pct), `${bar(pct)} ${pct}%`)}${reset ? `（${reset} リセット）` : ''}`);
} else {
  parts.push('週 --（最初の返答のあとに表示）');
}
if (five && typeof five.used_percentage === 'number') {
  const pct = Math.round(five.used_percentage);
  const reset = resetText(five.resets_at, false);
  parts.push(`5時間 ${paint(tone(pct), `${pct}%`)}${reset ? `（${reset}）` : ''}`);
}
process.stdout.write(parts.join(' ｜ '));

// 携帯で見るためのメモ（1分に1回まで書き出す。値が取れていないときは書かない）
const vault = process.env.OBSIDIAN_VAULT;
if (vault && week && typeof week.used_percentage === 'number') {
  const file = path.join(vault, 'Claude', '利用状況.md');
  try {
    let fresh = false;
    try {
      fresh = Date.now() - statSync(file).mtimeMs < 60_000;
    } catch {
      fresh = false;
    }
    if (!fresh) {
      const w = Math.round(week.used_percentage);
      const lines = [
        '# Claude の利用状況',
        '',
        `- 更新: ${fmtNow.format(new Date())}（PC の Claude Code が動いている間だけ更新）`,
        `- 週間: **${w}%** ${bar(w)}　リセット ${resetText(week.resets_at, true) || '不明'}`,
      ];
      if (five && typeof five.used_percentage === 'number') {
        const f = Math.round(five.used_percentage);
        lines.push(`- 5時間: **${f}%** ${bar(f)}　リセット ${resetText(five.resets_at, false) || '不明'}`);
      }
      if (w >= 80) lines.push('', '> 週間の上限が近い。急ぎでない作業は、リセットのあとに回す。');
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, lines.join('\n') + '\n');
    }
  } catch {
    // 書き出しに失敗しても、ステータスラインの表示は止めない
  }
}
