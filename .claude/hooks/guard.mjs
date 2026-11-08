#!/usr/bin/env node
// PreToolUse フック: 「ハーネス判断・権限・安全設定」の関門。
// - ファイル削除: 保護フォルダは停止、それ以外は人間に確認（プロジェクト内のビルド成果物と一時フォルダは素通し）
// - 強制push・リモートの枝の削除: 停止
// - .env（実キーの置き場所）への書き込み: 停止。安全設定（settings.json・フック）の書き換え: 人間に確認
// - 外部サービス: 削除・消去は停止 / 送信・課金・公開・共有などは人間に確認
//   （MCP と、gh・vercel・wrangler・DB の CLI。curl は DELETE を停止、外部へのデータ送信を確認）
//   JEB_MCP_STRICT=on にすると、読み取り以外の MCP 操作をすべて確認にする
//
// コマンドの文字列を読んで判断する「網」であり、完全な防御ではない。
// スクリプトファイルの中で行う処理（node script.js、npm run の中身など）は見えないので、最後の守りは Git とバックアップ。
import { readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const tool = String(input.tool_name || '');
const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
const projectDir = path.resolve(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
const startCwd = path.resolve(input.cwd || projectDir);
const HOME = os.homedir();

// 消してはいけない場所（プロジェクトからの相対パス。大文字小文字は区別しない）
const PROTECTED = ['.git', '.claude', '.env', 'claude.md', 'ai-ecosystem/knowledge', 'ai-ecosystem/design-systems'];
const PROTECTED_NAMES = ['.git', '.claude', '.env', 'claude.md', 'knowledge', 'design-systems'];
// 書き換えるときに人間の確認がいる安全設定
const SELF_CONFIG = ['.claude/settings.json', '.claude/settings.local.json', '.claude/hooks'];
// 作り直せるので消してよいフォルダ名（プロジェクト内だけ）
const REGENERABLE = new Set(['dist', 'build', 'coverage', 'node_modules', '.cache', '.vite', '.next', '.turbo']);
const TMP_ROOTS = [...new Set([os.tmpdir(), '/tmp', '/private/tmp'].map((d) => path.resolve(d)))];

function decide(permissionDecision, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision,
        permissionDecisionReason: `[ジェブ安全設定] ${reason}`,
      },
    }),
  );
  process.exit(0);
}

// ---- パスの扱い -----------------------------------------------------------
const unquote = (s) => String(s).replace(/^(["'])(.*)\1$/s, '$2');
function expand(p, cwd) {
  let s = unquote(p)
    .replace(/\$\{HOME\}|\$HOME\b/g, HOME)
    .replace(/\$\{PWD\}|\$PWD\b|\$\(pwd\)|`pwd`/g, cwd)
    .replace(/\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR\b/g, projectDir);
  if (s === '~' || s.startsWith('~/')) s = HOME + s.slice(1);
  return s;
}
const resolveFrom = (cwd, p) => path.resolve(cwd, expand(p, cwd));
const relOf = (abs) => path.relative(projectDir, abs);
const insideProject = (abs) => {
  const r = relOf(abs);
  return !r.startsWith('..') && !path.isAbsolute(r);
};
const relLower = (abs) => relOf(abs).toLowerCase();
const under = (r, base) => r === base || r.startsWith(base + path.sep);

function isProtected(abs) {
  if (!insideProject(abs)) return false;
  const r = relLower(abs);
  if (r === '') return true; // プロジェクト丸ごと
  return PROTECTED.some((p) => under(r, p) || p.startsWith(r + path.sep));
}
// ユーザー全体の設定（~/.claude/settings*.json）に disableAllHooks などを書かれると、ガードごと止まる
const USER_SETTINGS = ['settings.json', 'settings.local.json'].map((f) => path.join(HOME, '.claude', f));
const isSelfConfig = (abs) => USER_SETTINGS.includes(abs) || (insideProject(abs) && SELF_CONFIG.some((p) => under(relLower(abs), p)));
// フォルダごと上書きする操作で、安全設定がその中に含まれるか
function touchesSelfTree(abs) {
  if (isSelfConfig(abs)) return true;
  if (!insideProject(abs)) return false;
  const r = relLower(abs);
  return r === '' || SELF_CONFIG.some((p) => p.startsWith(r + path.sep));
}
// .env・.env.local など（.env.example や、.env.d.ts のようなコードのファイルは除く）
const isEnvFile = (abs) =>
  /^\.env(\..+)?$/i.test(path.basename(abs)) && !/\.(example|template|sample|ts|tsx|js|mjs|cjs|json|md)$/i.test(abs);
function isRegenerable(abs) {
  if (TMP_ROOTS.some((t) => abs.startsWith(t + path.sep))) return true;
  return insideProject(abs) && relLower(abs).split(path.sep).some((seg) => REGENERABLE.has(seg));
}
function isDangerousRoot(abs) {
  const parentOfProject = !path.relative(abs, projectDir).startsWith('..');
  return abs === path.parse(abs).root || abs === HOME || parentOfProject;
}
const hasGlob = (s) => /[*?[]/.test(s);
const hasVar = (s) => /\$/.test(s);
// オプションか（「-/.claude」のような、- で始まるパスは除く）
const isOpt = (a) => a.length > 1 && a.startsWith('-') && !a.includes('/');
function nonOptArgs(args) {
  const out = [];
  let rest = false;
  for (const a of args) {
    if (rest) out.push(a);
    else if (a === '--') rest = true;
    else if (!isOpt(a)) out.push(a);
  }
  return out;
}
// {a,b} の展開（1語の中、空白を含まないものだけ）
function braceExpand(word, depth = 0) {
  const m = word.match(/^([^{}\s]*)\{([^{}\s]*,[^{}\s]*)\}([^\s]*)$/);
  if (!m || depth > 3 || word.startsWith('${')) return [word];
  return m[2].split(',').flatMap((alt) => braceExpand(m[1] + alt + m[3], depth + 1));
}

// ---- シェルの分解 -----------------------------------------------------------
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']);
const INTERPRETERS = { node: ['-e', '--eval', '-p', '--print'], python: ['-c'], python3: ['-c'], perl: ['-e', '-E'], ruby: ['-e'], bun: ['-e', '--eval'], deno: ['eval'] };
const isInterpreter = (cmd) => cmd in INTERPRETERS || /^python3?(\.\d+)?$/.test(cmd);

// ヒアドキュメントを見つけ、本文をコマンドから外す。シェルやインタプリタに渡す本文は、別に検査する
function scanHeredocs(cmd) {
  const lines = cmd.split('\n');
  const kept = [];
  const feeds = [];
  const stack = ['top'];
  let pending = [];
  let body = [];
  for (const line of lines) {
    if (pending.length) {
      const cur = pending[0];
      if ((cur.dash ? line.replace(/^\t+/, '') : line).trim() === cur.tag) {
        feeds.push({ cmd: cur.cmd, body: body.join('\n') });
        body = [];
        pending.shift();
      } else body.push(line);
      continue;
    }
    kept.push(line);
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const top = stack[stack.length - 1];
      if (top === 'sq') {
        if (c === "'") stack.pop();
        continue;
      }
      if (c === '\\') {
        i++;
        continue;
      }
      if (top === 'dq') {
        if (c === '"') stack.pop();
        else if (c === '$' && line[i + 1] === '(') {
          stack.push('cmd');
          i++;
        }
        continue;
      }
      if (c === "'") stack.push('sq');
      else if (c === '"') stack.push('dq');
      else if (c === '$' && line[i + 1] === '(') {
        stack.push('cmd');
        i++;
      } else if (c === ')' && top === 'cmd') stack.pop();
      else if (c === '<' && line[i + 1] === '<' && line[i + 2] !== '<' && line[i - 1] !== '<') {
        const m = line.slice(i).match(/^<<(-?)\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\2/);
        if (m) {
          const before = line.slice(0, i).split(/[;&|(\n]/).pop().trim().split(/\s+/);
          while (before.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(before[0]) || ['sudo', 'env', 'command', 'exec'].includes(before[0]))) before.shift();
          pending.push({ dash: m[1] === '-', tag: m[3], cmd: path.basename(before[0] || '') });
          i += m[0].length - 1;
        }
      }
    }
  }
  return { text: kept.join('\n'), feeds };
}

// $( )・<( )・>( )・バッククォートの中身（シングルクォートの中は除く）
function substitutions(cmd) {
  const found = [];
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q === "'") {
      if (c === "'") q = null;
      continue;
    }
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === "'" && !q) q = "'";
    else if (c === '"') q = q === '"' ? null : '"';
    else if ((c === '$' || (!q && (c === '<' || c === '>'))) && cmd[i + 1] === '(') {
      let depth = 1;
      let j = i + 2;
      for (; j < cmd.length && depth; j++) {
        if (cmd[j] === '(') depth++;
        else if (cmd[j] === ')') depth--;
      }
      found.push(cmd.slice(i + 2, depth ? j : j - 1));
      i = j - 1;
    } else if (c === '`') {
      const end = cmd.indexOf('`', i + 1);
      if (end > i) {
        found.push(cmd.slice(i + 1, end));
        i = end;
      }
    }
  }
  return found;
}

// 引用符の外の ; && || | & 改行 で区切り、各部分を語に分ける（直前がパイプかも覚える）
function segments(cmd) {
  const segs = [];
  let words = [];
  let word = '';
  let has = false;
  let q = null;
  let pipeIn = false;
  const endWord = () => {
    if (has) words.push(word);
    word = '';
    has = false;
  };
  const endSeg = (nextPipe) => {
    endWord();
    if (words.length) segs.push({ words, pipeIn });
    words = [];
    pipeIn = nextPipe;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < cmd.length) word += cmd[++i];
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      has = true;
    } else if (c === '\\' && i + 1 < cmd.length) {
      word += cmd[++i];
      has = true;
    } else if (c === '|' && word.endsWith('>')) {
      word += c; // >| （上書きリダイレクト）
    } else if (c === '&' && (word.endsWith('>') || cmd[i + 1] === '>')) {
      word += c; // 2>&1、&>file
      has = true;
    } else if (c === ';' || c === '\n' || c === '|' || c === '&') {
      const isPipe = c === '|' && cmd[i + 1] !== '|';
      endSeg(isPipe);
      if ((c === '|' || c === '&') && cmd[i + 1] === c) i++;
    } else if (/\s/.test(c)) endWord();
    else {
      word += c;
      has = true;
    }
  }
  endSeg(false);
  return segs;
}

// リダイレクト先を取り出し、語の列から外す（入力リダイレクトも外す）
function splitRedirects(words) {
  const rest = [];
  const targets = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const out = w.match(/^(\d*|&)>>?\|?(.*)$/);
    if (out) {
      const t = out[2] !== '' ? out[2] : words[++i];
      if (t && !t.startsWith('&') && !t.startsWith('(')) targets.push(t);
      continue;
    }
    if (/^\d*<<?<?$/.test(w)) {
      i++;
      continue;
    }
    if (/^\d*<[^<]/.test(w) || /^<<-?/.test(w)) continue;
    rest.push(w);
  }
  return { rest, targets };
}

// コマンドの前に付く語（グループ化・制御構文・否定）
const PREFIX_WORDS = new Set(['(', '{', '!', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', 'time']);
// ラッパーと「値を取るオプション」
const WRAPPERS = {
  sudo: new Set(['-u', '-g', '-h', '-p', '-C', '-U', '-r', '-t', '-D', '-R', '-T']),
  doas: new Set(['-u', '-C']),
  env: new Set(['-u', '-C', '-S', '--unset', '--chdir']),
  nice: new Set(['-n', '--adjustment']),
  ionice: new Set(['-c', '-n', '-p', '-t']),
  timeout: new Set(['-s', '-k', '--signal', '--kill-after']),
  stdbuf: new Set(['-i', '-o', '-e']),
  nohup: new Set(),
  command: new Set(),
  builtin: new Set(),
  exec: new Set(['-a']),
  caffeinate: new Set(['-t', '-w']),
  npx: new Set(['-p', '--package', '-c', '--call']),
  bunx: new Set(['-p', '--package']),
  shx: new Set(),
  'with-secrets.sh': new Set(),
};
const XARGS_VALUE_OPTS = new Set(['-n', '-I', '-L', '-P', '-d', '-s', '-a', '-E', '-e', '-i', '-l']);
const DELETE_CMDS = new Set(['rm', 'rmdir', 'unlink', 'shred', 'trash', 'srm', 'rimraf', 'del', 'del-cli', 'trash-put', 'rmtrash']);

// 先頭のグループ化記号・制御構文・関数定義・環境変数代入・ラッパーを外して、本当のコマンドを取り出す
function stripPrefixes(input, cwd, depth) {
  let w = input.flatMap((x) => braceExpand(x));
  if (w.length) w[0] = w[0].replace(/^[({]+/, '');
  const count = (s, ch) => s.split(ch).length - 1;
  while (w.length) {
    const last = w[w.length - 1];
    if (last.endsWith(')') && count(last, ')') > count(last, '(')) w[w.length - 1] = last.slice(0, -1);
    else if (last.endsWith('}') && count(last, '}') > count(last, '{')) w[w.length - 1] = last.slice(0, -1);
    else break;
  }
  let viaXargs = false;
  for (let guard = 0; guard < 20 && w.length; guard++) {
    if (w[0] === '' || PREFIX_WORDS.has(w[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) {
      w.shift();
      continue;
    }
    if (w[0] === 'function') {
      w.splice(0, 2);
      continue;
    }
    if (/^[A-Za-z_][\w-]*\(\)$/.test(w[0])) {
      w.shift(); // 関数定義 f() { … }
      continue;
    }
    // $(which rm) や `command -v rm` の形（語に分かれていても1つにまとめて読む）
    if (/^(?:\$\(|`)(?:which|type|command)$/.test(w[0])) {
      let k = 1;
      while (k < w.length && isOpt(w[k])) k++;
      const target = (w[k] || '').replace(/[)`]+$/, '');
      if (target) {
        w.splice(0, k + 1, target);
        continue;
      }
    }
    const name = path.basename(w[0]);
    if ((name === 'pnpm' || name === 'yarn') && (w[1] === 'dlx' || w[1] === 'exec')) {
      w.splice(0, 2);
      continue;
    }
    if (name === 'npm' && (w[1] === 'exec' || w[1] === 'x')) {
      w.splice(0, 2);
      if (w[0] === '--') w.shift();
      continue;
    }
    if (name === 'gio' && ['trash', 'remove'].includes(w[1])) {
      w.splice(0, 2, 'rm');
      continue;
    }
    if (name in WRAPPERS) {
      const valueOpts = WRAPPERS[name];
      w.shift();
      while (w.length && (isOpt(w[0]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]))) {
        const opt = w.shift();
        if ((name === 'npx' && (opt === '-c' || opt === '--call')) && w.length) {
          checkBash(w.shift(), cwd, depth + 1); // npx -c "コマンド"
          continue;
        }
        if (valueOpts.has(opt)) w.shift();
        if (opt === '--') break;
      }
      if (name === 'timeout' && w.length && /^\d/.test(w[0])) w.shift(); // 時間
      continue;
    }
    if (name === 'xargs') {
      viaXargs = true;
      w.shift();
      while (w.length && isOpt(w[0])) {
        const opt = w.shift();
        if (XARGS_VALUE_OPTS.has(opt)) w.shift();
      }
      continue;
    }
    break;
  }
  return { words: w.filter((x) => x !== ')' && x !== '}'), viaXargs };
}

function checkDeleteTargets(targets, cwd, seg, { viaXargs = false, findNames = [] } = {}) {
  const list = targets.map((t) => unquote(t)).filter((t) => t !== '');
  if (list.length === 0) {
    decide('ask', `ファイル削除（${seg}）です。${viaXargs ? '消す対象が前のコマンドから渡されるため、' : ''}消してよいか人間が確認してください。`);
  }
  if (findNames.some((n) => PROTECTED_NAMES.some((p) => n.toLowerCase().replace(/[*?'"]/g, '') === p))) {
    decide('deny', `保護フォルダの名前で探して消そうとしています（${seg}）。`);
  }
  let needAsk = false;
  for (const raw of list) {
    const t = raw.replace(/\/+$/, '') || '/';
    if (hasGlob(t)) {
      // ワイルドカードは、展開される前の固定部分（親フォルダ）で判断する
      const gi = t.search(/[*?[]/);
      const slash = t.lastIndexOf('/', gi);
      const baseStr = slash < 0 ? '.' : slash === 0 ? '/' : t.slice(0, slash);
      const base = resolveFrom(cwd, baseStr);
      const tail = t.slice(slash + 1);
      if (isDangerousRoot(base) || isProtected(base)) decide('deny', `「${seg}」は保護フォルダやプロジェクト全体に及ぶ恐れがあるため止めました。`);
      if (/^\.\[?!?/.test(tail) && isDangerousRoot(base)) decide('deny', `「${seg}」は隠しフォルダごと消す恐れがあるため止めました。`);
      if (!isRegenerable(base)) needAsk = true;
      continue;
    }
    if (hasVar(expand(t, cwd))) {
      needAsk = true; // 中身の分からない変数
      continue;
    }
    const abs = resolveFrom(cwd, t);
    if (isDangerousRoot(abs)) {
      if (findNames.length && abs === projectDir) {
        needAsk = true; // find . -name '*.log' のように絞り込んでいる
        continue;
      }
      decide('deny', `「${seg}」はルート・ホーム・プロジェクト全体を消す恐れがあるため止めました。`);
    }
    // Git が残したロックファイル（.git/index.lock など）は、消すことがあるので確認にとどめる
    if (insideProject(abs) && under(relLower(abs), '.git') && abs.endsWith('.lock')) {
      needAsk = true;
      continue;
    }
    if (isProtected(abs)) decide('deny', `保護フォルダ（${relOf(abs) || '.'}）の削除は禁止です。どうしても必要なら人間が手動で行ってください。`);
    if (!isRegenerable(abs)) needAsk = true;
  }
  if (needAsk) decide('ask', `ファイル削除（${seg}）です。消してよいか人間が確認してください。`);
}

// プログラムの中身（node -e、python -c、パイプやヒアドキュメントで渡したもの）を調べる
const CODE_DELETE = /(rmSync|rmdirSync|unlinkSync|\.rm\(|\.rmdir\(|\.unlink\(|rimraf|shutil\.rmtree|os\.remove|os\.unlink|os\.rmdir|rmtree|File\.delete|FileUtils\.rm)/;
const CODE_SHELL = /(os\.system|subprocess|child_process|execSync|exec\(|spawnSync|spawn\(|popen|system\()/;
const CODE_WRITE = /(writeFileSync|appendFileSync|writeFile\(|appendFile\(|createWriteStream|copyFileSync|symlinkSync|open\([^)]*,\s*['"][wax+]|write_text|write_bytes|shutil\.copy|Path\([^)]*\)\.write)/;
function checkCode(code, cwd, seg, depth) {
  const literals = [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  if (CODE_SHELL.test(code)) for (const lit of literals) checkBash(lit, cwd, depth + 1);
  // パスらしい文字列（空白を含まず、/ を含むか . や ~ で始まる）
  const paths = literals.filter((l) => l && !/\s/.test(l) && (l.includes('/') || l.startsWith('.') || l.startsWith('~')));
  // 書き込み: .env は停止、安全設定は確認
  if (CODE_WRITE.test(code)) for (const p of paths) checkWritePath(resolveFrom(cwd, p), `プログラムの中の書き込み（${seg}）`);
  if (!CODE_DELETE.test(code)) return;
  for (const p of paths) {
    const abs = resolveFrom(cwd, p);
    if (isProtected(abs) || isDangerousRoot(abs)) decide('deny', `プログラムの中から保護フォルダを消そうとしています（${seg}）。`);
  }
  if (paths.length && paths.every((p) => isRegenerable(resolveFrom(cwd, p)))) return;
  decide('ask', `プログラムの中でファイルを削除しています（${seg}）。消してよいか人間が確認してください。`);
}

// 「delete from:news@…」のような検索語（from: の形）は SQL ではない
const SQL_DESTRUCTIVE = /\b(drop\s+(table|database|schema|view|index)|truncate\s+table|delete\s+from\b(?!:))/i;
const DB_CLIS = new Set(['psql', 'mysql', 'sqlite3', 'mongosh', 'mongo', 'duckdb', 'cockroach', 'sqlcmd']);

function checkBash(command, cwdIn = startCwd, depth = 0) {
  if (depth > 6 || typeof command !== 'string' || !command) return;
  const { text, feeds } = scanHeredocs(command);
  for (const f of feeds) {
    if (SHELLS.has(f.cmd)) checkBash(f.body, cwdIn, depth + 1);
    else if (isInterpreter(f.cmd)) checkCode(f.body, cwdIn, `${f.cmd} へのヒアドキュメント`, depth);
  }
  for (const inner of substitutions(text)) checkBash(inner, cwdIn, depth + 1);

  let cwd = cwdIn;
  let prev = null;
  for (const { words: raw, pipeIn } of segments(text)) {
    const { rest, targets: redirects } = splitRedirects(raw);
    const { words, viaXargs } = stripPrefixes(rest, cwd, depth);
    const seg = raw.join(' ');
    const prevSeg = prev;
    prev = words;
    for (const t of redirects) checkWritePath(resolveFrom(cwd, t), `リダイレクト（${seg}）`);
    if (!words.length) continue;

    const cmd = path.basename(words[0]);
    const args = words.slice(1);

    if (cmd === 'cd' || cmd === 'pushd') {
      cwd = args[0] && args[0] !== '-' ? resolveFrom(cwd, args[0]) : HOME;
      continue;
    }
    // パイプでシェル・インタプリタに流し込む形（echo "…" | bash、curl … | sh）
    if ((SHELLS.has(cmd) || isInterpreter(cmd)) && pipeIn && !args.some((a) => a === '-c' || /^-[a-z]*c$/.test(a) || a === '-e')) {
      const src = prevSeg ? path.basename(prevSeg[0] || '') : '';
      if (src === 'echo' || src === 'printf') {
        const body = prevSeg.slice(1).filter((a) => !isOpt(a)).join(' ');
        if (SHELLS.has(cmd)) checkBash(body, cwd, depth + 1);
        else checkCode(body, cwd, seg, depth);
      } else if (['curl', 'wget'].includes(src)) {
        decide('ask', `ネットから取ってきたスクリプトをそのまま実行します（${seg}）。中身を人間が確認してください。`);
      }
      continue;
    }
    if (SHELLS.has(cmd)) {
      const ci = args.findIndex((a) => a === '-c' || /^-[a-z]*c$/.test(a));
      if (ci >= 0 && args[ci + 1] !== undefined) checkBash(args[ci + 1], cwd, depth + 1);
      continue;
    }
    if (cmd === 'eval') {
      checkBash(args.join(' '), cwd, depth + 1);
      continue;
    }
    if (isInterpreter(cmd)) {
      const flags = INTERPRETERS[cmd] ?? INTERPRETERS.python;
      const ci = args.findIndex((a) => flags.includes(a) || (cmd === 'perl' && /^-[a-zA-Z]*e$/.test(a)));
      if (cmd === 'perl' && args.some((a) => /^-[a-zA-Z]*i/.test(a))) {
        const files = args.filter((a, i) => !isOpt(a) && i !== ci + 1);
        for (const f of files) checkWritePath(resolveFrom(cwd, f), `書き換え（${seg}）`);
      }
      if (ci >= 0) checkCode(args.slice(ci + 1).join(' '), cwd, seg, depth);
      continue;
    }

    if (cmd === 'git') {
      checkGit(args, cwd, seg);
      continue;
    }
    if (cmd === 'gh') {
      checkGh(args, seg);
      continue;
    }
    if (cmd === 'vercel' || cmd === 'netlify') {
      if (args.some((a) => ['remove', 'rm', 'delete', 'sites:delete'].includes(a))) decide('deny', `公開先のサイト・プロジェクトの削除（${seg}）は禁止です。人間が画面から行ってください。`);
      if (args.some((a) => ['--prod', 'promote', 'alias', 'domains', 'env', 'rollback'].includes(a))) decide('ask', `本番公開・公開先の設定変更（${seg}）です。人間が確認してください。`);
      continue;
    }
    if (cmd === 'wrangler') {
      if (args.includes('delete')) decide('deny', `Cloudflare 上の削除（${seg}）は禁止です。`);
      if (args.some((a) => ['deploy', 'publish', 'secret', 'rollback'].includes(a))) decide('ask', `Cloudflare への公開・設定変更（${seg}）です。人間が確認してください。`);
      continue;
    }
    if (['curl', 'wget', 'http', 'https', 'xh'].includes(cmd)) {
      const joined = args.join(' ');
      if (/(^|\s)(-X\s*|--request\s+|--method\s+)DELETE\b/i.test(joined) || /^DELETE$/i.test(args[0] || '')) {
        decide('deny', `外部サービスへの DELETE リクエスト（${seg}）は禁止です。`);
      }
      // 外部へのデータ送信（投稿・Webhook など）は確認。自分のPCの中（localhost）は対象外
      const sends =
        /(^|\s)(-X\s*|--request\s+|--method\s+)(POST|PUT|PATCH)\b/i.test(joined) ||
        args.some((a) => /^(-d|-F|-T|--data(-[a-z]+)?|--form(-string)?|--json|--upload-file|--post-data|--post-file)(=|$)/.test(a) || /^-[dFT]./.test(a));
      const urls = args.filter((a) => /^[a-z]+:\/\//i.test(a) || /^\$/.test(a));
      const local = urls.length > 0 && urls.every((u) => /^[a-z]+:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])([:/]|$)/i.test(u));
      if (sends && !local) decide('ask', `外部へのデータ送信（${seg}）です。送り先と内容を人間が確認してください。`);
      continue;
    }
    if (DB_CLIS.has(cmd) || cmd === 'dropdb' || cmd === 'dropuser') {
      if (cmd.startsWith('drop') || args.some((a) => SQL_DESTRUCTIVE.test(a))) decide('deny', `データベースのデータを消す操作（${seg}）は禁止です。`);
      continue;
    }
    if ((cmd === 'supabase' && args[0] === 'db' && args[1] === 'reset') || (cmd === 'prisma' && args.includes('reset')) || (cmd === 'prisma' && args.includes('--force-reset'))) {
      decide('deny', `データベースを初期化する操作（${seg}）は禁止です。`);
    }

    if (cmd === 'mv') {
      checkMove(args, cwd, seg);
      continue;
    }
    if (cmd === 'tee') {
      for (const d of nonOptArgs(args)) checkWritePath(resolveFrom(cwd, d), `書き込み（${seg}）`);
      continue;
    }
    if (['cp', 'install', 'ln'].includes(cmd)) {
      const { sources, dest } = splitSourcesDest(args, cwd, cmd === 'install' ? ['-m', '-o', '-g', '--mode', '--owner', '--group'] : []);
      if (!dest) continue;
      const recursive = args.some((a) => /^-[a-zA-Z]*[rRa]/.test(a) || a === '--recursive' || a === '--archive');
      // 空のファイルや別の場所へのリンクで、保護ファイルを中身ごと置き換える形
      const blanking = sources.includes('/dev/null') || (cmd === 'ln' && args.some((a) => /^-[a-zA-Z]*f/.test(a) || a === '--force'));
      for (const abs of [dest.abs, ...dest.inside]) {
        checkWritePath(abs, `書き込み（${seg}）`);
        if (recursive && touchesSelfTree(abs)) decide('ask', `安全設定を含むフォルダをまとめて上書きします（${seg}）。人間が確認してください。`);
        if (blanking && isProtected(abs)) decide('ask', `保護フォルダのファイルを置き換えます（${seg}）。人間が確認してください。`);
      }
      continue;
    }
    if (cmd === 'rsync') {
      const dest = nonOptArgs(args).at(-1);
      if (dest) {
        const abs = resolveFrom(cwd, dest);
        if (args.some((a) => a.startsWith('--delete') || a === '--remove-source-files')) {
          if (isProtected(abs) || isDangerousRoot(abs)) decide('deny', `保護フォルダを同期で消す恐れがあります（${seg}）。`);
          decide('ask', `削除を伴う同期（${seg}）です。人間が確認してください。`);
        }
        checkWritePath(abs, `同期（${seg}）`);
        if (touchesSelfTree(abs)) decide('ask', `安全設定を含むフォルダへの同期です（${seg}）。人間が確認してください。`);
      }
      continue;
    }
    if (cmd === 'tar') {
      const cluster = args.find((a) => /^-?[a-zA-Z]+$/.test(a) && !a.startsWith('--')) || '';
      const files = nonOptArgs(args);
      if (/f/.test(cluster) && files.length) files.shift(); // アーカイブのファイル名
      if (args.includes('--remove-files')) checkDeleteTargets(files, cwd, seg);
      const ci = args.findIndex((a) => a === '-C' || a === '--directory');
      // -C がなければ、今いるフォルダに展開される
      const dir = (ci >= 0 ? args[ci + 1] : args.find((a) => a.startsWith('--directory='))?.slice(12)) || '.';
      if (/x/.test(cluster) || args.includes('--extract')) checkExtractDest(resolveFrom(cwd, dir), seg);
      continue;
    }
    if (cmd === 'unzip') {
      const di = args.indexOf('-d');
      const listOnly = args.some((a) => /^-[a-zA-Z]*[lvt]/.test(a) && !/^-[a-zA-Z]*o/.test(a));
      if (!listOnly) checkExtractDest(resolveFrom(cwd, di >= 0 ? args[di + 1] || '.' : '.'), seg);
      continue;
    }
    if (cmd === 'dd') {
      for (const a of args) if (a.startsWith('of=')) checkWritePath(resolveFrom(cwd, a.slice(3)), `dd（${seg}）`);
      continue;
    }
    if (cmd === 'sed' && args.some((a) => /^-[a-zA-Z]*i/.test(a) || a.startsWith('--in-place'))) {
      const files = nonOptArgs(args).filter((a) => a !== '');
      for (const f of files.slice(1)) checkWritePath(resolveFrom(cwd, f), `書き換え（${seg}）`);
      continue;
    }
    if (['truncate', 'chmod', 'chown', 'chattr'].includes(cmd)) {
      const files = nonOptArgs(args).filter((a) => !/^\d+$/.test(a) && !/^[ugoa]*[+=-][rwxXst]*$/.test(a));
      for (const f of files) {
        const abs = resolveFrom(cwd, f);
        checkWritePath(abs, `${cmd}（${seg}）`);
        if (isProtected(abs) && cmd !== 'chmod') decide('ask', `保護フォルダのファイルを ${cmd} で変更します（${seg}）。人間が確認してください。`);
      }
      continue;
    }

    // 削除系
    if (DELETE_CMDS.has(cmd)) {
      checkDeleteTargets(nonOptArgs(args), cwd, seg, { viaXargs });
      continue;
    }
    if (cmd === 'find') {
      const execIdx = args.findIndex((a) => ['-exec', '-execdir', '-ok', '-okdir'].includes(a));
      const execCmd = path.basename(args[execIdx + 1] || '');
      const execDeletes = execIdx >= 0 && (DELETE_CMDS.has(execCmd) || execCmd === 'mv'); // 見つけたものを移動するのも、元の場所から消える
      if (!args.includes('-delete') && !execDeletes) continue;
      const starts = [];
      for (const a of args) {
        if (a.startsWith('-') || a === '(' || a === '!') break;
        starts.push(a);
      }
      const names = [];
      args.forEach((a, i) => {
        if (['-name', '-iname', '-path', '-ipath', '-regex'].includes(a) && args[i + 1]) names.push(args[i + 1]);
      });
      const filtered = names.length > 0 || args.some((a) => ['-type', '-newer', '-mtime', '-size'].includes(a));
      checkDeleteTargets(starts.length ? starts : ['.'], cwd, seg, { findNames: filtered ? (names.length ? names : ['*']) : [] });
    }
  }
}

function checkGit(args, cwd, seg) {
  const g = [...args];
  let gcwd = cwd;
  while (g.length && g[0].startsWith('-')) {
    const opt = g.shift();
    if (opt === '-C') gcwd = resolveFrom(gcwd, g.shift() ?? '.');
    else if (opt === '-c') {
      const v = g.shift() ?? '';
      // git -c alias.p="push -f" p … のような別名での強制 push
      if (/^alias\./i.test(v) && /push/.test(v) && /(\s-[a-zA-Z]*[fd]\b|--force|--mirror|--delete|\s\+|\s:)/.test(v)) {
        decide('deny', `別名を使った強制 push・削除（${seg}）は禁止です。`);
      }
    } else if (opt === '--namespace' || opt === '--git-dir' || opt === '--work-tree') g.shift();
  }
  const sub = g[0];
  const subArgs = g.slice(1);
  if (sub === 'push') {
    const cluster = (a) => /^-[a-zA-Z]+$/.test(a);
    const force = subArgs.some((a) => a === '--force' || (cluster(a) && a.includes('f')) || a.startsWith('--force-with-lease') || a === '--force-if-includes' || unquote(a).startsWith('+') || a === '--mirror' || a === '--prune');
    if (force) decide('deny', 'git push の強制（--force / -f / --force-with-lease / --mirror / +ブランチ）は禁止です。履歴を書き換えない方法を選ぶか、人間に依頼してください。');
    const del = subArgs.some((a) => a === '--delete' || (cluster(a) && a.includes('d')) || /^:[^:]/.test(unquote(a)));
    if (del) decide('deny', `リモートのブランチ・タグの削除（${seg}）は禁止です。必要なら人間が GitHub の画面から行ってください。`);
    return;
  }
  if (sub === 'clean') {
    const targets = [];
    let dry = false;
    let ignored = false;
    for (let i = 0; i < subArgs.length; i++) {
      const a = subArgs[i];
      if (a === '-e' || a === '--exclude') i++;
      else if (a.startsWith('--exclude=') || /^-e./.test(a)) continue;
      else if (a === '--dry-run') dry = true;
      else if (/^-[a-zA-Z]+$/.test(a)) {
        if (a.includes('n')) dry = true;
        if (/[xX]/.test(a)) ignored = true;
      } else if (a !== '--' && !a.startsWith('--')) targets.push(a);
    }
    if (dry) return;
    if (ignored) {
      const abs = targets.map((t) => resolveFrom(gcwd, t));
      if (abs.length === 0 || abs.some((a) => isDangerousRoot(a) || isProtected(a))) {
        decide('deny', `git clean -x は Git に入っていないファイル（.env・私的メモ・output の原稿など）まで消します（${seg}）。消す範囲をフォルダで指定してください（例: git clean -fdx dist）。`);
      }
    }
    checkDeleteTargets(targets, gcwd, seg);
    return;
  }
  if (sub === 'rm') {
    if (subArgs.includes('--cached')) return; // 管理から外すだけで、ファイルは消えない
    checkDeleteTargets(nonOptArgs(subArgs), gcwd, seg);
    return;
  }
  if (sub === 'mv') {
    checkMove(subArgs, gcwd, seg);
    return;
  }
  if (sub === 'send-pack' && subArgs.some((a) => a === '--force' || /^-[a-zA-Z]*f/.test(a) || a === '--mirror')) {
    decide('deny', `強制的な送信（${seg}）は禁止です。`);
  }
  if (sub === 'apply' || sub === 'am') {
    // パッチの中身を読み、安全設定や .env を書き換えるものは確認・停止にする
    for (const f of nonOptArgs(subArgs)) {
      let text = '';
      try {
        text = readFileSync(resolveFrom(gcwd, f), 'utf8').slice(0, 2_000_000);
      } catch {
        continue;
      }
      for (const m of text.matchAll(/^(?:\+\+\+|---) [ab]\/(\S+)|^diff --git a\/(\S+)/gm)) {
        checkWritePath(resolveFrom(gcwd, m[1] ?? m[2]), `パッチの適用（${seg}）`);
      }
    }
    return;
  }
  if (sub === 'checkout' || sub === 'restore') {
    if (sub === 'restore' && subArgs.includes('--staged') && !subArgs.some((a) => a === '--worktree' || a === '-W')) return; // ステージから外すだけ
    const dd = subArgs.indexOf('--');
    let paths;
    if (dd >= 0) paths = subArgs.slice(dd + 1);
    else {
      // -- がない形（git checkout <版> <パス>、git checkout <パス>、git checkout <ブランチ>）。
      // 版・ブランチ名もパスとして調べるが、安全設定に当たらない名前なら何も起きない
      const VALUE_OPTS = new Set(['-b', '-B', '--orphan', '-s', '--source', '--conflict', '--pathspec-from-file']);
      paths = [];
      for (let i = 0; i < subArgs.length; i++) {
        const a = subArgs[i];
        if (VALUE_OPTS.has(a)) i++;
        else if (!isOpt(a)) paths.push(a);
      }
    }
    for (const p of paths) {
      const abs = resolveFrom(gcwd, p);
      checkWritePath(abs, `git ${sub}（${seg}）`);
      if (touchesSelfTree(abs)) decide('ask', `安全設定を含む場所を git ${sub} で書き戻します（${seg}）。人間が確認してください。`);
    }
  }
}

function checkExtractDest(abs, seg) {
  checkWritePath(abs, `展開（${seg}）`);
  if (touchesSelfTree(abs)) decide('ask', `安全設定を含む場所に展開します（${seg}）。中身を人間が確認してください。`);
}

function checkGh(args, seg) {
  const [noun, verb] = args;
  if (noun === 'api') {
    const joined = args.join(' ');
    const m = joined.match(/(?:^|\s)(?:-X\s*|--method[\s=])([A-Za-z]+)/);
    // -X がなくても、-f / -F / --input でデータを渡すと POST になる
    const hasFields = args.some((a) => /^(-f|-F|--field|--raw-field|--input)(=|$)/.test(a) || /^-[fF]./.test(a));
    const method = (m?.[1] || (hasFields ? 'POST' : 'GET')).toUpperCase();
    if (method === 'DELETE') decide('deny', `GitHub API での削除（${seg}）は禁止です。`);
    if (['POST', 'PUT', 'PATCH'].includes(method)) decide('ask', `GitHub API での書き込み（${seg}）です。公開リポジトリに反映されるので、人間が確認してください。`);
    return;
  }
  // コマンドの語（gh <名詞> [<小分類>] <動詞>）を前から最大3語集める。-R / --repo とその値は飛ばし、
  // ほかのオプションが出たらそこで止める（検索語の delete を拾わないため）
  const words = [];
  for (let i = 0; i < args.length && words.length < 3; i++) {
    const a = args[i];
    if (a === '-R' || a === '--repo') i++;
    else if (a.startsWith('--repo=')) continue;
    else if (isOpt(a)) break;
    else words.push(a);
  }
  // gh repo deploy-key delete、gh release delete-asset、gh project item-delete なども削除として扱う
  if (words[0] !== 'search' && words.slice(1).some((w) => /(^|-)delete($|-)/.test(w))) {
    decide('deny', `GitHub 上の削除（${seg}）は禁止です。必要なら人間が画面から行ってください。`);
  }
  if (noun === 'repo' && verb === 'sync' && args.some((a) => a === '--force')) decide('deny', `リモートの枝を強制で上書きする操作（${seg}）は禁止です。`);
  const askPairs = {
    repo: ['create', 'edit', 'rename', 'archive', 'transfer', 'fork'],
    release: ['create', 'edit', 'upload'],
    pr: ['merge', 'close', 'comment', 'review'],
    issue: ['create', 'comment', 'close', 'edit', 'transfer'],
    secret: ['set'],
    variable: ['set'],
    workflow: ['run', 'enable', 'disable'],
    gist: ['create', 'edit'],
  };
  if (askPairs[words[0]]?.includes(words[1])) decide('ask', `GitHub への公開・変更（${seg}）です。人間が確認してください。`);
}

// mv・cp・install・ln の「元」と「先」を分ける。先がフォルダなら、中にできるファイル（先/元の名前）も返す
function splitSourcesDest(args, cwd, valueOpts = []) {
  const sources = [];
  let destRaw;
  let targetFlag = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    // -t <先> / -vt <先> のようなまとめ書き / --target-directory[=]<先>
    if (a === '--target-directory' || /^-[a-zA-Z]*t$/.test(a)) {
      destRaw = args[++i];
      targetFlag = true;
    } else if (a.startsWith('--target-directory=')) {
      destRaw = a.slice('--target-directory='.length);
      targetFlag = true;
    } else if (valueOpts.includes(a)) i++;
    else if (!isOpt(a)) sources.push(a);
  }
  if (destRaw === undefined) destRaw = sources.pop();
  if (destRaw === undefined) return { sources, dest: null };
  const abs = resolveFrom(cwd, destRaw);
  let isDir = targetFlag || sources.length > 1 || /\/$/.test(destRaw);
  if (!isDir) {
    try {
      isDir = statSync(abs).isDirectory();
    } catch {
      isDir = false;
    }
  }
  const inside = isDir ? sources.map((s) => path.join(abs, path.basename(unquote(s).replace(/\/+$/, '')))) : [];
  return { sources, dest: { abs, inside } };
}

function checkMove(args, cwd, seg) {
  const { sources, dest } = splitSourcesDest(args, cwd);
  for (const s of sources) {
    const abs = resolveFrom(cwd, s);
    if (isProtected(abs) || isDangerousRoot(abs)) decide('deny', `保護フォルダ（${relOf(abs) || '.'}）の移動は禁止です。必要なら人間が手動で行ってください。`);
  }
  if (dest) for (const abs of [dest.abs, ...dest.inside]) checkWritePath(abs, `移動（${seg}）`);
}

// ---- ファイル書き込み -------------------------------------------------------
function checkWritePath(abs, what = '書き込み') {
  if (isEnvFile(abs)) {
    decide('deny', `.env には実際のキーが入るため、AIは書き換えません（${what}）。キーは 1Password に入れ、.env には op:// の参照だけを人間が書いてください（見本は .env.example）。`);
  }
  if (insideProject(abs) && under(relLower(abs), '.git')) decide('deny', `.git フォルダの中を直接書き換えることは禁止です（${what}）。`);
  if (isSelfConfig(abs)) {
    decide('ask', `安全設定（${relOf(abs)}）の書き換えです（${what}）。AIが自分で安全設定を外していないか、人間が確認してください。`);
  }
}

// ---- MCP（外部サービス） ---------------------------------------------------
const READ_WORDS = /(^|_)(get|list|search|read|fetch|query|describe|count|aggregate|whoami|help|find|view|show|download|lookup|check|preview)(_|$)/;
const DELETE_WORDS = /(^|_)(delete|remove|trash|destroy|purge|wipe|erase|clear|truncate|drop)(_|$)/;
const DELETE_EXCEPTIONS = /remove_background/;
const RISKY_WORDS =
  /(^|_)(send|reply|forward|pay|payment|buy|purchase|order|transfer|remit|invoice|billing|charge|refund|publish|deploy|deployment|promote|rollback|share|invite|post|tweet|comment|push|pull|merge|fork|repository|project|domain|alias|release|protection|firewall|bypass|secret|env|permission|permissions|token|config)(_|$)/;
const SQL_TOOL = /(^|_)(sql|execute|database|db|query)(_|$)/;

function stringsIn(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsIn(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => stringsIn(v, out));
  return out;
}

function checkMcp(name) {
  const parts = name.split('__');
  const server = (parts[1] || '').toLowerCase();
  // camelCase も語に分ける（deleteConfluencePage → delete_confluence_page）
  const toolPart =
    parts
      .slice(2)
      .join('__')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/-/g, '_')
      .toLowerCase() || name.toLowerCase();

  // 端末操作系の MCP（コマンド実行・ファイル操作）も Bash や書き込みと同じ関門に通す
  if (typeof ti.command === 'string') checkBash(ti.command);
  if (/interact/.test(toolPart) && typeof ti.input === 'string') {
    // 送る先はシェルとは限らない（Python や Node の対話画面）ので、両方の基準で見る
    checkBash(ti.input);
    checkCode(ti.input, startCwd, name, 0);
  }
  if (/(write|edit|move|create|rename|copy|block)/.test(toolPart)) {
    for (const key of ['path', 'file_path', 'filePath', 'destination', 'target']) {
      if (typeof ti[key] === 'string') checkWritePath(path.resolve(startCwd, expand(ti[key], startCwd)), name);
    }
  }
  if (typeof ti.source === 'string' && /(move|rename)/.test(toolPart) && isProtected(path.resolve(startCwd, expand(ti.source, startCwd)))) {
    decide('deny', `保護フォルダの移動（${name}）は禁止です。`);
  }

  // 削除・消去（名前か、引数の中身で判断）
  if (DELETE_WORDS.test(toolPart) && !DELETE_EXCEPTIONS.test(toolPart)) {
    decide('deny', `外部サービス上の削除・消去（${name}）はAIに禁止しています。必要なら人間が画面から操作してください。`);
  }
  if (ti.trashed === true) decide('deny', `ゴミ箱へ移す操作（${name}）は、削除と同じ扱いで禁止です。`);
  if (/(modify|label)/.test(toolPart) && stringsIn(ti).includes('TRASH')) decide('deny', `ゴミ箱へ移す操作（${name}）は、削除と同じ扱いで禁止です。`);
  // SQL を実行する道具か、sql・statement 引数を持つ道具だけを見る（検索・読み取りの query は SQL ではない）
  const isSqlTool = SQL_TOOL.test(toolPart) && !(/(^|_)query(_|$)/.test(toolPart) && /(^|_)(search|list|get|read|find)(_|$)/.test(toolPart));
  const sqlArgs = ['sql', 'statement', ...(READ_WORDS.test(toolPart) && !isSqlTool ? [] : ['query'])].map((k) => ti[k]).filter((v) => typeof v === 'string');
  if ((isSqlTool ? stringsIn(ti) : sqlArgs).some((s) => SQL_DESTRUCTIVE.test(s))) {
    decide('deny', `データを消す SQL（DROP / TRUNCATE TABLE / DELETE FROM）を含む操作（${name}）は禁止です。`);
  }

  if (name.toLowerCase().startsWith('mcp__claude-code-remote__')) return; // セッション管理系は Claude Code 側の確認に任せる
  if (READ_WORDS.test(toolPart)) return;

  // 参加者を入れた予定は招待メールが飛ぶ
  if (Array.isArray(ti.attendees) && ti.attendees.length) decide('ask', `参加者に招待が届く操作（${name}）です。宛先と内容を人間が確認してください。`);
  if (RISKY_WORDS.test(toolPart)) {
    decide('ask', `送信・お金・公開・共有・設定変更に関わる操作（${name}）です。内容（宛先・金額・本文・公開範囲）を人間が確認してから実行してください。`);
  }
  if (server === 'github') decide('ask', `GitHub への書き込み（${name}）です。公開リポジトリに反映されるので、人間が確認してください。`);
  if (process.env.JEB_MCP_STRICT === 'on') {
    decide('ask', `外部サービスへの書き込み（${name}）です（JEB_MCP_STRICT=on）。人間が確認してください。`);
  }
}

try {
  if (tool === 'Bash') checkBash(String(ti.command || ''));
  else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const fp = ti.file_path || ti.notebook_path;
    if (typeof fp === 'string' && fp) checkWritePath(path.resolve(startCwd, fp), tool);
  } else if (tool.startsWith('mcp__')) checkMcp(tool);
} catch (error) {
  // ガード自身の不具合で作業を止めないよう、判定できないときは通常の許可確認に任せる
  process.stderr.write(`[guard] 判定中にエラー: ${error?.message ?? error}\n`);
}
process.exit(0);
