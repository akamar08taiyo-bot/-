#!/usr/bin/env node
/**
 * scripts/ にある台本をすべて書き出す。
 *   node render-all.mjs              # 全部
 *   node render-all.mjs keiba        # ファイル名に keiba を含むものだけ
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv.slice(2).filter(a => !a.startsWith('--'));
const passthrough = process.argv.slice(2).filter(a => a.startsWith('--'));

const targets = fs.readdirSync(path.join(HERE, 'scripts'))
  .filter(f => f.endsWith('.json'))
  .filter(f => filter.length === 0 || filter.some(k => f.includes(k)))
  .sort();

if (targets.length === 0) {
  console.error('該当する台本がありません: scripts/*.json');
  process.exit(1);
}
console.log(`[render-all] ${targets.length}本: ${targets.join(', ')}`);

let failed = 0;
for (const file of targets) {
  console.log(`\n===== ${file} =====`);
  const r = spawnSync(process.execPath, [
    path.join(HERE, 'render.mjs'), '--script', path.join('scripts', file), ...passthrough,
  ], {stdio: 'inherit', cwd: HERE});
  if (r.status !== 0) { failed++; console.error(`[fail] ${file}`); }
}
console.log(`\n[render-all] 完了（失敗 ${failed}件）`);
process.exit(failed ? 1 : 0);
