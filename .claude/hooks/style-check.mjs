#!/usr/bin/env node
// PostToolUse フック: 文章を書いたら「ジェブ」の文体チェック、画面系ファイルを書いたら「AIっぽいデザイン」チェックを必ず走らせる。
// NG一覧は Obsidian のナレッジ（ai-ecosystem/knowledge/dictionary/*.md の表）から読むので、メモを育てるほど精度が上がる。
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}
if (process.env.JEB_STYLE_CHECK === 'off') process.exit(0);

const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const ti = input.tool_input || {};
const filePath = String(ti.file_path || '');
if (!filePath) process.exit(0);

const norm = filePath.split(path.sep).join('/');
// ルール定義そのもの・依存パッケージは対象外
if (/\/(\.claude|node_modules|dictionary)\//.test(norm)) process.exit(0);

const ext = path.extname(filePath).toLowerCase();
const TEXT_EXT = new Set(['.md', '.mdx', '.txt', '.html', '.htm']);
const DESIGN_EXT = new Set(['.html', '.htm', '.css', '.scss', '.tsx', '.jsx', '.vue', '.svg']);
if (!TEXT_EXT.has(ext) && !DESIGN_EXT.has(ext)) process.exit(0);

// 今回書いた部分だけを見る（既存の文章まで指摘しない）
let added = '';
if (typeof ti.content === 'string') added = ti.content;
else if (typeof ti.new_string === 'string') added = ti.new_string;
else if (Array.isArray(ti.edits)) added = ti.edits.map((e) => e.new_string || '').join('\n');
if (!added.trim()) process.exit(0);

function loadTable(file) {
  const p = path.join(projectDir, 'ai-ecosystem', 'knowledge', 'dictionary', file);
  if (!existsSync(p)) return [];
  const rows = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    // 「\|」はセル内の文字として扱い、それ以外の「|」でセルを区切る
    const cells = line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
    if (cells.length < 2) continue;
    const pattern = cells[0].replace(/^`|`$/g, '');
    const advice = cells[1];
    if (!pattern || /^:?-+:?$/.test(pattern) || pattern === 'NG表現' || pattern === 'NGパターン') continue;
    let re;
    const rx = pattern.match(/^\/(.+)\/([a-z]*)$/);
    try {
      re = rx ? new RegExp(rx[1], rx[2].includes('g') ? rx[2] : rx[2] + 'g') : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    } catch {
      continue;
    }
    rows.push({ pattern, advice, re });
  }
  return rows;
}

const findings = [];
function scan(rows, label) {
  for (const r of rows) {
    const hits = added.match(r.re);
    if (hits) findings.push(`- [${label}] 「${hits[0]}」×${hits.length} → ${r.advice}`);
  }
}
if (TEXT_EXT.has(ext)) scan(loadTable('ng-phrases.md'), '文章');
if (DESIGN_EXT.has(ext)) scan(loadTable('ng-design.md'), 'デザイン');
if (findings.length === 0) process.exit(0);

process.stdout.write(
  JSON.stringify({
    decision: 'block',
    reason:
      `[ジェブ文体・デザインチェック] ${path.relative(projectDir, filePath)} に直したほうがよい表現があります。\n` +
      findings.slice(0, 15).join('\n') +
      '\n直してから先に進んでください。意図して残す場合は、その理由を一文で述べてください。',
  }),
);
