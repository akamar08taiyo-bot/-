#!/usr/bin/env node
// ステータスライン: Claude Code の画面の下に、週間と5時間の利用制限を常に表示する。
// Claude Code が標準入力に渡す JSON の rate_limits（Pro / Max / Ultra の契約で、最初の返答のあとに入る）を読む。
// rate_limits の値は、そのセッションが返答を受け取ったときにだけ変わる（待機中の描き直しでは変わらない）。
//
// 環境変数 OBSIDIAN_VAULT（絶対パス・既存のフォルダ）があれば、同じ内容を「Claude/利用状況.md」に書き出す。
// 保管庫を携帯と同期すれば携帯でも見られる。書くのは値が変わったときだけ。週間・5時間それぞれについて、
// 待機中の別のセッションが持つ古い値（同じ集計期間でより低い値、前の期間の値）では上書きしない。
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
// 同じ集計期間かどうか（リセット時刻が返答ごとに数秒ずれても、1時間以内なら同じ期間とみなす）
const SAME_WINDOW_SEC = 3600;
const sameWin = (a, b) => a && b && Math.abs(a.resetsAt - b.resetsAt) <= SAME_WINDOW_SEC;
const eqWin = (a, b) => (!a && !b) || (a && b && a.pct === b.pct && a.resetsAt === b.resetsAt);

// 前にメモした値（prev）と今回の値（cur）から、新しいほうを1つ選ぶ（週間・5時間それぞれ）。
// 同じ期間の中で使用率は下がらないので、低い値は待機中の別のセッションが持つ古い値とみなす
function pickNewer(prev, cur, nowSec) {
  const prevAlive = prev && (!prev.resetsAt || prev.resetsAt > nowSec);
  if (!cur) return prevAlive ? prev : null; // 今回この窓の値がない: 前の値がまだ有効なら残す
  if (!prevAlive) return cur;
  if (prev.resetsAt && cur.resetsAt) {
    if (prev.resetsAt - cur.resetsAt > SAME_WINDOW_SEC) return prev; // 前の値のほうが新しい期間
    if (sameWin(prev, cur) && prev.pct > cur.pct) return prev; // 同じ期間で前の値のほうが高い
  }
  return cur;
}

// メモ先頭の目印から前回の値を読む（前の版の形式も読める）
function readPrev(file) {
  if (!existsSync(file)) return null;
  const m = readFileSync(file, 'utf8').match(/<!-- jeb-usage (\{.*?\}) -->/);
  if (!m) return null;
  try {
    const p = JSON.parse(m[1]);
    const win = (v, r) => (v && typeof v === 'object' ? v : typeof v === 'number' ? { pct: v, resetsAt: r ?? null } : null);
    return { week: win(p.week, p.weekReset), five: win(p.five, p.fiveReset), at: p.at };
  } catch {
    return null;
  }
}

function writeMemo(file) {
  const nowSec = Date.now() / 1000;
  const prev = readPrev(file);
  const merged = {
    week: pickNewer(prev?.week, week, nowSec),
    five: pickNewer(prev?.five, five, nowSec),
  };
  if (prev && eqWin(merged.week, prev.week) && eqWin(merged.five, prev.five)) return; // 変わっていなければ書かない
  // 時刻は、今回の値を取り込んだときだけ新しくする（古い値の期限切れで消えただけなら前の時刻のまま）
  const tookNew = (merged.week === week && !eqWin(week, prev?.week)) || (five && merged.five === five && !eqWin(five, prev?.five));
  const at = tookNew || !prev?.at ? new Date() : new Date(prev.at);
  const w = merged.week;
  const f = merged.five;
  const lines = [
    `<!-- jeb-usage ${JSON.stringify({ week: w, five: f, at: at.toISOString() })} -->`,
    '# Claude の利用状況',
    '',
    `- PC で受け取った時刻: ${fmtDay.format(at)}`,
    `- 週間: **${w.pct}%** ${bar(w.pct)}　リセット ${fmt(w.resetsAt, fmtWeekday) || '不明'}`,
  ];
  if (f) lines.push(`- 5時間: **${f.pct}%** ${bar(f.pct)}　リセット ${fmt(f.resetsAt, fmtTime) || '不明'}`);
  lines.push(
    '',
    '値は、PC の Claude Code が返答を受け取ったときに変わる。携帯や Web で使った分は、PC で次に返答を受け取るまで反映されない。',
  );
  if (w.pct >= 80) lines.push('', '> 週間の上限が近い。急ぎでない作業は、リセットのあとに回す。');
  mkdirSync(path.dirname(file), { recursive: true });
  // 書きかけを読まれないよう、一時ファイルに書いてから置き換える。
  // 一時ファイルは「.」始まりの決まった名前にし、途中で止められても保管庫に余計なファイルが増えないようにする
  const tmp = path.join(path.dirname(file), '.利用状況.md.tmp');
  writeFileSync(tmp, lines.join('\n') + '\n');
  renameSync(tmp, file);
}

// 書き出し（上の関数と定数を定義したあとで呼ぶ）
const vault = process.env.OBSIDIAN_VAULT;
if (vault && path.isAbsolute(vault) && existsSync(vault) && week) {
  try {
    writeMemo(path.join(vault, 'Claude', '利用状況.md'));
  } catch {
    // 書き出しに失敗しても、ステータスラインの表示は止めない
  }
}
