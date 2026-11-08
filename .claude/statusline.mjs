#!/usr/bin/env node
// ステータスライン: Claude Code の画面の下に、週間と5時間の利用制限を常に表示する。
// Claude Code が標準入力に渡す JSON の rate_limits（Pro / Max / Ultra の契約で、最初の返答のあとに入る）を読む。
// rate_limits の値は、そのセッションが返答を受け取ったときにだけ変わる（待機中の描き直しでは変わらない）。
//
// 環境変数 OBSIDIAN_VAULT（絶対パス・既存のフォルダ）があれば、同じ内容を「Claude/利用状況.md」に書き出す。
// 保管庫を携帯と同期すれば携帯でも見られる。書くのは値が変わったときだけで、待機中の別のセッションが持つ
// 古い値（同じ集計期間でより低い値）では上書きしない。
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  input = {};
}
if (!input || typeof input !== 'object') input = {};

const color = !process.env.NO_COLOR;
const paint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const tone = (pct) => (pct >= 80 ? '31' : pct >= 50 ? '33' : '32'); // 赤・黄・緑

function bar(pct, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return '■'.repeat(filled) + '□'.repeat(width - filled);
}

// 日時の表示（範囲外の値やミリ秒の値で落ちないようにする）
const fmtWeekday = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('ja-JP', { hour: 'numeric', minute: '2-digit' });
function fmt(epochSeconds, formatter) {
  if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds) || epochSeconds <= 0 || epochSeconds > 1e11) return '';
  try {
    return formatter.format(new Date(epochSeconds * 1000));
  } catch {
    return '';
  }
}

// 利用率の窓（five_hour / seven_day）を、数字として使える形にそろえる
function windowOf(w) {
  if (!w || typeof w !== 'object' || typeof w.used_percentage !== 'number' || !Number.isFinite(w.used_percentage)) return null;
  return { pct: Math.max(0, Math.round(w.used_percentage)), resetsAt: typeof w.resets_at === 'number' && Number.isFinite(w.resets_at) ? w.resets_at : null };
}

const limits = input.rate_limits && typeof input.rate_limits === 'object' ? input.rate_limits : {};
const week = windowOf(limits.seven_day);
const five = windowOf(limits.five_hour);
const model = typeof input.model?.display_name === 'string' ? input.model.display_name : '';
const answered = Number(input.cost?.total_api_duration_ms) > 0; // このセッションで返答を受け取ったか

// 画面幅に合わせて表示を短くする（幅が分からないときは通常の表示）
const cols = Number(process.env.COLUMNS) || 0;
const compact = cols > 0 && cols < 80;
const tiny = cols > 0 && cols < 50;

let line;
if (tiny) {
  line = [week ? `週${week.pct}%` : '週--', five ? `5h${five.pct}%` : ''].filter(Boolean).join(' ');
} else {
  const parts = [];
  if (model && !compact) parts.push(model);
  if (week) {
    const reset = fmt(week.resetsAt, compact ? fmtDay : fmtWeekday);
    parts.push(`週 ${paint(tone(week.pct), `${bar(week.pct)} ${week.pct}%`)}${reset ? `（${reset} リセット）` : ''}`);
  } else {
    parts.push(answered ? '週 --（この契約では表示されないか、リセット直後）' : '週 --（最初の返答のあとに表示）');
  }
  if (five) {
    const reset = fmt(five.resetsAt, fmtTime);
    parts.push(`5時間 ${paint(tone(five.pct), `${five.pct}%`)}${reset ? `（${reset}）` : ''}`);
  }
  line = parts.join(' ｜ ');
}
process.stdout.write(line);

// ---- 携帯で見るためのメモ ----------------------------------------------------
const vault = process.env.OBSIDIAN_VAULT;
if (vault && path.isAbsolute(vault) && existsSync(vault) && week) {
  try {
    writeMemo(path.join(vault, 'Claude', '利用状況.md'));
  } catch {
    // 書き出しに失敗しても、ステータスラインの表示は止めない
  }
}

function writeMemo(file) {
  const state = { week: week.pct, weekReset: week.resetsAt, five: five?.pct ?? null, fiveReset: five?.resetsAt ?? null };
  let prev = null;
  if (existsSync(file)) {
    const m = readFileSync(file, 'utf8').match(/<!-- jeb-usage (\{.*?\}) -->/);
    if (m) {
      try {
        prev = JSON.parse(m[1]);
      } catch {
        prev = null;
      }
    }
  }
  if (prev) {
    const same = ['week', 'weekReset', 'five', 'fiveReset'].every((k) => prev[k] === state[k]);
    if (same) return; // 値が変わっていなければ書かない（同期の履歴を増やさない）
    // 同じ集計期間の中で使用率が下がることはない。低い値は、待機中の別のセッションが持つ古い値
    if (prev.weekReset && state.weekReset) {
      if (prev.weekReset > state.weekReset) return;
      if (prev.weekReset === state.weekReset && prev.week > state.week) return;
    }
  }
  const now = new Date();
  const lines = [
    `<!-- jeb-usage ${JSON.stringify({ ...state, at: now.toISOString() })} -->`,
    '# Claude の利用状況',
    '',
    `- PC で受け取った時刻: ${fmtDay.format(now)}`,
    `- 週間: **${state.week}%** ${bar(state.week)}　リセット ${fmt(state.weekReset, fmtWeekday) || '不明'}`,
  ];
  if (five) lines.push(`- 5時間: **${five.pct}%** ${bar(five.pct)}　リセット ${fmt(five.resetsAt, fmtTime) || '不明'}`);
  lines.push(
    '',
    '値は、PC の Claude Code が返答を受け取ったときに変わる。携帯や Web で使った分は、PC で次に返答を受け取るまで反映されない。',
  );
  if (state.week >= 80) lines.push('', '> 週間の上限が近い。急ぎでない作業は、リセットのあとに回す。');
  mkdirSync(path.dirname(file), { recursive: true });
  // 書きかけを読まれないよう、一時ファイルに書いてから置き換える
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, lines.join('\n') + '\n');
  renameSync(tmp, file);
}
