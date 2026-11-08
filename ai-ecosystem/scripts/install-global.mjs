#!/usr/bin/env node
// このリポジトリの AI 環境（ジェブ・フック・スキル・サブエージェント・ナレッジ）を、
// PC 全体の Claude Code 設定（~/.claude）に入れる・外す。どのプロジェクトで Claude Code を開いても効くようになる。
//
// 使い方（リポジトリのフォルダで実行）:
//   node ai-ecosystem/scripts/install-global.mjs              入れる（何度実行しても同じ結果になる）
//   node ai-ecosystem/scripts/install-global.mjs --dry-run    何をするかだけ表示して、何も変えない
//   node ai-ecosystem/scripts/install-global.mjs --uninstall  外す（入れる前の状態に戻す。育てたメモは残す）
//   --skip-npm  スクリプト用のパッケージ（Claude / OpenAI の SDK）を入れない
//
// 守っていること:
// - 既存の ~/.claude/settings.json と ~/.claude/CLAUDE.md は上書きせず、足すだけ。変更前に必ずバックアップを取る
// - 2回目以降も、~/.claude/jeb/knowledge（育てたメモ・NG 辞書）と design-systems は上書きしない
// - プロジェクト側に同じフックがあるときは、PC 全体のフックは何もしない（二重に動かない）
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const UNINSTALL = args.has('--uninstall');
const SKIP_NPM = args.has('--skip-npm');

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOME = os.homedir();
const CLAUDE_DIR = path.join(HOME, '.claude');
const JEB = path.join(CLAUDE_DIR, 'jeb');
const MANIFEST = path.join(JEB, 'install-manifest.json');
const IMPORT_LINE = '@~/.claude/jeb/CLAUDE.md';
const HOOK_MARK = '/.claude/jeb/hooks/';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP = path.join(JEB, 'backup', stamp);

const log = (msg) => console.log(`${DRY ? '[試し] ' : ''}${msg}`);
const rel = (p) => p.replace(HOME, '~');
const readJson = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);

function loadManifest() {
  try {
    return readJson(MANIFEST, { createdFiles: [], originals: {}, addedPermissions: { deny: [], ask: [] } });
  } catch {
    return { createdFiles: [], originals: {}, addedPermissions: { deny: [], ask: [] } };
  }
}

// 既存のファイルを上書きする前に、最初の1回だけ元の内容を控える（外すときに戻すため）
function backupOriginal(manifest, target) {
  if (!fs.existsSync(target) || manifest.originals[target] || manifest.createdFiles.includes(target)) return;
  const dest = path.join(BACKUP, path.relative(HOME, target));
  if (!DRY) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(target, dest);
  }
  manifest.originals[target] = dest;
}

function writeFile(manifest, target, content, { overwrite = true, mode } = {}) {
  const exists = fs.existsSync(target);
  if (exists && !overwrite) return 'skip';
  const same = exists && fs.readFileSync(target, 'utf8') === content;
  if (!same) {
    if (exists) backupOriginal(manifest, target);
    else if (!manifest.createdFiles.includes(target)) manifest.createdFiles.push(target);
    if (!DRY) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  }
  // 元のファイルの実行権限をそのまま写す（with-secrets.sh などを直接実行できるように）
  if (!DRY && mode !== undefined && fs.existsSync(target)) fs.chmodSync(target, mode);
  return same ? 'same' : exists ? 'update' : 'create';
}

function saveManifest(manifest) {
  if (DRY) return;
  fs.mkdirSync(JEB, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

// ~/.claude/settings.json を読む。空のファイルは「設定なし」として扱い、壊れた JSON はエラーにする
function readSettings(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return {};
  const value = JSON.parse(text);
  const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!isPlainObject(value)) throw new Error('中身が { } の形ではありません');
  if (value.hooks !== undefined && !isPlainObject(value.hooks)) throw new Error('hooks が { } の形ではありません');
  for (const [event, list] of Object.entries(value.hooks ?? {})) {
    if (!Array.isArray(list)) throw new Error(`hooks.${event} が配列ではありません`);
    if (list.some((g) => !isPlainObject(g) || !Array.isArray(g.hooks))) throw new Error(`hooks.${event} の中に、hooks の配列を持たないまとまりがあります`);
  }
  if (value.permissions !== undefined && !isPlainObject(value.permissions)) throw new Error('permissions が { } の形ではありません');
  for (const kind of ['allow', 'deny', 'ask']) {
    if (value.permissions?.[kind] !== undefined && !Array.isArray(value.permissions[kind])) throw new Error(`permissions.${kind} が配列ではありません`);
  }
  return value;
}

function copyTree(manifest, src, dest, { overwrite = true, transform = (s) => s, skip = () => false } = {}) {
  const counts = { create: 0, update: 0, same: 0, skip: 0 };
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const from = path.join(dir, entry.name);
      const relPath = path.relative(src, from);
      if (skip(relPath, entry)) continue;
      if (entry.isDirectory()) walk(from);
      else if (entry.isFile()) {
        const to = path.join(dest, relPath);
        const isText = /\.(md|mjs|js|json|sh|txt)$/.test(entry.name);
        const mode = fs.statSync(from).mode & 0o777;
        if (isText) counts[writeFile(manifest, to, transform(fs.readFileSync(from, 'utf8')), { overwrite, mode })]++;
        else if (overwrite || !fs.existsSync(to)) {
          if (fs.existsSync(to)) backupOriginal(manifest, to);
          else if (!manifest.createdFiles.includes(to)) manifest.createdFiles.push(to);
          if (!DRY) {
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.copyFileSync(from, to);
          }
          counts.create++;
        } else counts.skip++;
      }
    }
  };
  walk(src);
  return counts;
}

// スキル・サブエージェントの本文はリポジトリ版のまま変えず、場所の読み方だけを冒頭に書き足す。
// 同じ名前なら PC 全体のスキルがプロジェクトのスキルより優先されるため、本文を変えると
// このリポジトリでの動き（NG 辞書の場所、出力先）まで変わってしまう。
const GLOBAL_NOTE =
  '> PC 全体に入れた版。この説明の `ai-ecosystem/` は、今のプロジェクトにそのフォルダがあればそれを指す。' +
  'なければ `~/.claude/jeb/` を指す（`ai-ecosystem/output/` は `~/AI-output/`）。' +
  'スキルの一覧は `.claude/skills/` と `~/.claude/skills/` の両方を見る。' +
  '「このリポジトリは公開」という注意は、公開リポジトリで作業するときに当てはまる。\n';
function addGlobalNote(text) {
  const m = text.match(/^---\n[\s\S]*?\n---\n/);
  return m ? `${m[0]}\n${GLOBAL_NOTE}${text.slice(m[0].length)}` : `${GLOBAL_NOTE}\n${text}`;
}

const HOOK_EVENTS = [
  ['UserPromptSubmit', null, 'route-prompt.mjs', 10],
  ['PreToolUse', 'Bash|Edit|Write|MultiEdit|NotebookEdit|mcp__.*', 'guard.mjs', 10],
  ['PostToolUse', 'Write|Edit|MultiEdit', 'style-check.mjs', 10],
  ['Stop', null, 'stop-judge.mjs', 15],
  ['SessionEnd', null, 'session-memo.mjs', 10],
];
// プロジェクトに「ジェブの」同じフックがあれば何もしない（このリポジトリなどで二重に動かないように）。
// ジェブと関係のない同名のフックを持つプロジェクトでは、PC 全体のフックが動く
const hookCommand = (file) =>
  `grep -qsE 'JEB_|ジェブ|セッションログ' "$CLAUDE_PROJECT_DIR/.claude/hooks/${file}" || node "$HOME/.claude/jeb/hooks/${file}"`;
const isOurHook = (h) => typeof h.command === 'string' && h.command.includes(HOOK_MARK);
// ジェブのフックだけを取り除く。同じまとまりに利用者が足したフックは残す
const stripOurHooks = (list = []) =>
  list.map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurHook(h)) })).filter((g) => g.hooks.length > 0);

function mergeSettings(manifest, settings) {
  const file = path.join(CLAUDE_DIR, 'settings.json');
  const project = readJson(path.join(REPO, '.claude', 'settings.json'), {});
  settings.hooks ??= {};
  for (const [event, matcher, hookFile, timeout] of HOOK_EVENTS) {
    const list = stripOurHooks(settings.hooks[event]);
    list.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: hookCommand(hookFile), timeout }] });
    settings.hooks[event] = list;
  }
  settings.permissions ??= {};
  for (const kind of ['deny', 'ask']) {
    const current = new Set(settings.permissions[kind] ?? []);
    for (const rule of project.permissions?.[kind] ?? []) {
      if (!current.has(rule)) {
        current.add(rule);
        if (!manifest.addedPermissions[kind].includes(rule)) manifest.addedPermissions[kind].push(rule);
      }
    }
    settings.permissions[kind] = [...current];
  }
  // 利用制限を常に表示するステータスライン。自分のステータスラインがあれば、そちらを残す。
  // 前に入れたジェブのものなら、新しい設定に置き換える
  const jebStatusLine = { type: 'command', command: 'node "$HOME/.claude/jeb/statusline.mjs"', padding: 0, refreshInterval: 60 };
  if (!settings.statusLine || String(settings.statusLine.command || '').includes('/.claude/jeb/')) {
    settings.statusLine = jebStatusLine;
    log('ステータスライン: 週間・5時間の利用制限の表示を登録');
  } else {
    log('ステータスライン: すでに自分の設定があるので、そのまま残しました');
  }
  const result = writeFile(manifest, file, JSON.stringify(settings, null, 2) + '\n');
  log(`設定 ${rel(file)}: フック5つと権限ルールを追加（${result}）`);
}

function ensureImport(manifest) {
  const file = path.join(CLAUDE_DIR, 'CLAUDE.md');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (current.split('\n').some((l) => l.trim() === IMPORT_LINE)) return log(`${rel(file)}: 読み込みの行はすでにあります`);
  const add = `${current && !current.endsWith('\n') ? '\n' : ''}${current ? '\n' : ''}# AI環境（ジェブ）のルール。外すときは install-global.mjs --uninstall\n${IMPORT_LINE}\n`;
  writeFile(manifest, file, current + add);
  log(`${rel(file)}: ジェブのルールを読み込む行を追加`);
}

function install() {
  if (!fs.existsSync(path.join(REPO, '.claude', 'hooks', 'guard.mjs'))) throw new Error('リポジトリのフォルダの中から実行してください（.claude/hooks が見つかりません）。');
  // 何かを書く前に、今の設定が読めるかを確かめる（読めなければ、ここで止めて何も変えない）
  const settingsFile = path.join(CLAUDE_DIR, 'settings.json');
  let settings;
  try {
    settings = readSettings(settingsFile);
  } catch (error) {
    throw new Error(`${rel(settingsFile)} を読めません（${error.message}）。直してからもう一度実行してください。何も変更していません。`);
  }
  const claudeMd = path.join(CLAUDE_DIR, 'CLAUDE.md');
  if (fs.existsSync(claudeMd) && !fs.statSync(claudeMd).isFile()) throw new Error(`${rel(claudeMd)} がファイルではありません。何も変更していません。`);

  const manifest = loadManifest();
  log(`入れる先: ${rel(CLAUDE_DIR)}`);
  try {
    installSteps(manifest, settings);
  } finally {
    // 途中で止まっても、それまでに変えた内容と控えの場所を必ず記録する（--uninstall で戻せるように）
    saveManifest(manifest);
  }
  console.log(`
${DRY ? '試しに表示しただけで、何も変えていません。' : '入れ終わりました。'}
- 開いている Claude Code は一度終了して開き直すと、どのプロジェクトでもジェブが働きます。
- APIキーを使うスクリプトは、${rel(path.join(JEB, '.env.example'))} を .env に複製して 1Password の参照を書いてください。
- 成果物は ~/AI-output/<案件>/ に置かれます。
- リポジトリのスキルを直したときは、もう一度このスクリプトを実行してください（同じ名前なら PC 全体のスキルが優先されるため）。
- 元に戻すとき: node ai-ecosystem/scripts/install-global.mjs --uninstall`);
}

function installSteps(manifest, settings) {

  // 1. 共通の置き場所 ~/.claude/jeb
  const c1 = copyTree(manifest, path.join(REPO, '.claude', 'hooks'), path.join(JEB, 'hooks'));
  log(`フック → ${rel(path.join(JEB, 'hooks'))}（新規 ${c1.create}・更新 ${c1.update}）`);
  writeFile(manifest, path.join(JEB, 'statusline.mjs'), fs.readFileSync(path.join(REPO, '.claude', 'statusline.mjs'), 'utf8'));
  for (const dir of ['scripts', 'bots']) {
    const c = copyTree(manifest, path.join(REPO, 'ai-ecosystem', dir), path.join(JEB, dir));
    log(`${dir} → ${rel(path.join(JEB, dir))}（新規 ${c.create}・更新 ${c.update}）`);
  }
  for (const f of ['package.json', 'package-lock.json']) writeFile(manifest, path.join(JEB, f), fs.readFileSync(path.join(REPO, 'ai-ecosystem', f), 'utf8'));
  writeFile(manifest, path.join(JEB, '.env.example'), fs.readFileSync(path.join(REPO, '.env.example'), 'utf8'));
  writeFile(manifest, path.join(JEB, 'CLAUDE.md'), fs.readFileSync(path.join(REPO, 'ai-ecosystem', 'global', 'CLAUDE.md'), 'utf8'));
  // スキルの中から参照される手順書と図鑑
  for (const f of ['SETUP.md', 'README.md']) writeFile(manifest, path.join(JEB, f), fs.readFileSync(path.join(REPO, 'ai-ecosystem', f), 'utf8'));
  // ナレッジとデザインシステムは、育てた内容を守るため上書きしない（私的なフォルダの中身はコピーしない）
  const privateDirs = /^(daily|clients|Claude|private)\//;
  const k = copyTree(manifest, path.join(REPO, 'ai-ecosystem', 'knowledge'), path.join(JEB, 'knowledge'), {
    overwrite: false,
    skip: (r, e) => e.isFile() && privateDirs.test(r) && !/(README\.md|_template\.md)$/.test(r),
  });
  log(`ナレッジ → ${rel(path.join(JEB, 'knowledge'))}（新規 ${k.create}・すでにあるので残した ${k.skip}）`);
  const d = copyTree(manifest, path.join(REPO, 'ai-ecosystem', 'design-systems'), path.join(JEB, 'design-systems'), { overwrite: false });
  log(`デザインシステム → ${rel(path.join(JEB, 'design-systems'))}（新規 ${d.create}・残した ${d.skip}）`);

  // 2. スキルとサブエージェント（本文はそのまま。冒頭に場所の読み方を書き足す）
  const s = copyTree(manifest, path.join(REPO, '.claude', 'skills'), path.join(CLAUDE_DIR, 'skills'), { transform: addGlobalNote });
  log(`スキル14個 → ${rel(path.join(CLAUDE_DIR, 'skills'))}（新規 ${s.create}・更新 ${s.update}）`);
  const a = copyTree(manifest, path.join(REPO, '.claude', 'agents'), path.join(CLAUDE_DIR, 'agents'), { transform: addGlobalNote });
  log(`サブエージェント5体 → ${rel(path.join(CLAUDE_DIR, 'agents'))}（新規 ${a.create}・更新 ${a.update}）`);

  // 3. ルールの読み込みと、フック・権限・ステータスラインの登録
  ensureImport(manifest);
  mergeSettings(manifest, settings);

  // 4. スクリプト用のパッケージ
  if (!DRY && !SKIP_NPM) {
    log('スクリプト用のパッケージを入れています（npm install）…');
    const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--omit=dev'], { cwd: JEB, stdio: 'inherit', shell: process.platform === 'win32' });
    if (r.status !== 0) console.warn('npm install に失敗しました。あとで ~/.claude/jeb で npm install を実行してください。');
  }
}

function uninstall() {
  if (!fs.existsSync(MANIFEST)) {
    console.log('PC 全体には入っていないようです（install-manifest.json がありません）。');
    return;
  }
  const manifest = loadManifest();

  // 1. 設定からフックと、こちらが足した権限ルールだけを外す（あなたが後から足した設定は残す）
  const settingsFile = path.join(CLAUDE_DIR, 'settings.json');
  if (fs.existsSync(settingsFile)) {
    let settings;
    try {
      settings = readSettings(settingsFile);
    } catch (error) {
      throw new Error(`${rel(settingsFile)} を読めません（${error.message}）。直してからもう一度実行してください。何も変更していません。`);
    }
    for (const event of Object.keys(settings.hooks ?? {})) {
      settings.hooks[event] = stripOurHooks(settings.hooks[event]);
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
    }
    if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
    for (const kind of ['deny', 'ask']) {
      if (!settings.permissions?.[kind]) continue;
      settings.permissions[kind] = settings.permissions[kind].filter((r) => !manifest.addedPermissions[kind].includes(r));
      if (settings.permissions[kind].length === 0) delete settings.permissions[kind];
    }
    if (settings.permissions && Object.keys(settings.permissions).length === 0) delete settings.permissions;
    // こちらが入れたステータスラインだけを外す（自分で作ったものは残す）
    if (String(settings.statusLine?.command || '').includes('/.claude/jeb/')) delete settings.statusLine;
    if (!DRY) fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
    log(`設定 ${rel(settingsFile)}: ジェブのフックと権限ルールを外しました`);
  }

  // 2. CLAUDE.md から読み込みの行を外す
  const claudeMd = path.join(CLAUDE_DIR, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    const lines = fs.readFileSync(claudeMd, 'utf8').split('\n');
    const kept = lines.filter((l) => l.trim() !== IMPORT_LINE && !l.startsWith('# AI環境（ジェブ）のルール。'));
    if (!DRY) fs.writeFileSync(claudeMd, kept.join('\n').replace(/\n{3,}$/, '\n\n'));
    log(`${rel(claudeMd)}: 読み込みの行を外しました`);
  }

  // 3. スキルとサブエージェント: 元からあったものは戻し、新しく作ったものは片付ける
  const managed = (p) => p.startsWith(path.join(CLAUDE_DIR, 'skills') + path.sep) || p.startsWith(path.join(CLAUDE_DIR, 'agents') + path.sep);
  for (const [target, backup] of Object.entries(manifest.originals)) {
    if (!managed(target) || !fs.existsSync(backup)) continue;
    if (!DRY) fs.copyFileSync(backup, target);
    log(`戻しました: ${rel(target)}`);
  }
  for (const target of manifest.createdFiles.filter(managed)) {
    if (!fs.existsSync(target)) continue;
    if (!DRY) {
      fs.unlinkSync(target);
      const dir = path.dirname(target);
      if (dir !== path.join(CLAUDE_DIR, 'skills') && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    }
    log(`片付けました: ${rel(target)}`);
  }
  if (!DRY) fs.renameSync(MANIFEST, `${MANIFEST}.uninstalled-${stamp}`);
  console.log(`
${DRY ? '試しに表示しただけで、何も変えていません。' : '外し終わりました。Claude Code を開き直すと元の状態に戻ります。'}
~/.claude/jeb（育てたメモ・NG 辞書・バックアップ）は残してあります。不要なら、中身を確かめてから自分で消してください。`);
}

try {
  if (UNINSTALL) uninstall();
  else install();
} catch (error) {
  console.error(`止めました: ${error.message}`);
  // 途中まで進んでいた場合は、控えの記録が残っているので元に戻せる
  if (!UNINSTALL && !DRY && fs.existsSync(MANIFEST)) {
    console.error('途中まで入った分は、node ai-ecosystem/scripts/install-global.mjs --uninstall で元に戻せます。');
  }
  process.exit(1);
}
