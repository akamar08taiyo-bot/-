#!/usr/bin/env node
// 動画からコマを抜いて「見られる形」にする：一定間隔のコマを並べたシート（時刻入り）、
// カットの切り替わり（場面転換）の検出とカット長の統計、音量（ラウドネス）・無音の割合、文字起こし用の音声。
// 入力は YouTube の URL（yt-dlp で低画質を一時取得）か、手元の動画ファイル。
//
// 使い方:
//   node yt-frames.mjs <URL|動画ファイル> [--out <フォルダ>] [--every 5] [--grid 4x4] [--width 384]
//                      [--scene 0.3] [--no-scenes] [--audio] [--subs] [--keep]
//                      [--max-height 480] [--start 0:30] [--end 2:00]
//
//   --every    シートのコマ間隔（秒）。既定は長さに応じて 1〜20 秒
//   --scene    カット検出の感度（0〜1。小さいほど敏感。ディゾルブ多めなら 0.2 前後）
//   --audio    文字起こし用の音声 audio.wav（16kHz モノラル）も書き出す
//   --subs     yt-dlp で字幕も取る（URL のときだけ）→ transcript.txt
//   --keep     取得した動画を消さずに残す（既定では分析後に消す）
//
// 出力: <out>/frames/index.md（最初に読む）、sheet_*.jpg、cuts/、scenes.json、audio.wav
// 必要なもの: ffmpeg / ffprobe。URL のときは yt-dlp と JS ランタイム（deno か Node 22 以上）
import fs from 'node:fs';
import path from 'node:path';
import {
  ensureProxy,
  parseArgs,
  parseVideoId,
  parseTime,
  fmtTime,
  run,
  versionOf,
  writeText,
  writeJson,
  ensureDir,
} from './lib/common.mjs';
import { parseVtt } from './lib/youtube.mjs';

ensureProxy();

const args = parseArgs(process.argv.slice(2), { flags: ['help', 'no-scenes', 'audio', 'subs', 'keep'] });
if (args.help || !args._[0]) {
  console.log(
    'node yt-frames.mjs <URL|動画ファイル> [--out <フォルダ>] [--every 5] [--grid 4x4] [--scene 0.3] [--audio] [--subs] [--keep]',
  );
  process.exit(args.help ? 0 : 1);
}

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

/** yt-dlp の呼び方を探す（単体の実行ファイル → python -m yt_dlp） */
function findYtDlp() {
  if (versionOf('yt-dlp')) return ['yt-dlp'];
  for (const py of ['python3', 'python', 'py']) {
    if (versionOf(py, ['-m', 'yt_dlp', '--version'])) return [py, '-m', 'yt_dlp'];
  }
  return null;
}

/** yt-dlp が YouTube で使う JS ランタイム。deno があれば既定のまま、無ければ Node 22+ を指定 */
function jsRuntimeArgs() {
  if (versionOf('deno')) return [];
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 22) return ['--js-runtimes', `node:${process.execPath}`];
  return [];
}

/** drawtext 用の書体（OS ごとの定番）。見つからなければ null */
function findFont() {
  const cands = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/Library/Fonts/Arial.ttf',
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/segoeui.ttf',
  ];
  return cands.find((f) => fs.existsSync(f)) || null;
}

/** ffmpeg のフィルタ引数用に書体のパスをエスケープ（Windows のドライブの : など） */
function escFilterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  if (!r.found) fail('ffprobe が見つかりません（ffmpeg を入れてください：Windows は `winget install ffmpeg`）');
  if (!r.ok) fail(`ffprobe で読めません：${r.stderr.slice(0, 300)}`);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  const fpsOf = (s) => {
    const [n, d] = String(s?.avg_frame_rate || s?.r_frame_rate || '0/1').split('/').map(Number);
    return d ? Math.round((n / d) * 100) / 100 : null;
  };
  return {
    duration: Number(j.format?.duration) || Number(v?.duration) || 0,
    width: v?.width,
    height: v?.height,
    fps: fpsOf(v),
    vcodec: v?.codec_name,
    hasAudio: Boolean(a),
    acodec: a?.codec_name,
  };
}

function autoEvery(duration) {
  if (duration <= 60) return 1;
  if (duration <= 180) return 2;
  if (duration <= 600) return 5;
  if (duration <= 1800) return 10;
  return 20;
}

const stats = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { count: xs.length, mean, median: mid, min: s[0], max: s[s.length - 1] };
};
const r1 = (x) => Math.round(x * 10) / 10;

async function main() {
  const input = args._[0];
  const out = path.resolve(args.out || (fs.existsSync(input) ? `frames_${path.parse(input).name}` : `yt_${parseVideoId(input)?.id || 'video'}`));
  const fdir = ensureDir(path.join(out, 'frames'));
  if (!versionOf('ffmpeg', ['-hide_banner', '-version'])) fail('ffmpeg が見つかりません（Windows は `winget install ffmpeg`、Linux は apt などで）');

  const start = parseTime(args.start);
  const end = parseTime(args.end);
  const notes = [];
  let src = null;
  let downloaded = false;

  // 1) 入力：手元のファイル or YouTube（yt-dlp で低画質を一時取得）
  if (fs.existsSync(input)) {
    src = path.resolve(input);
  } else {
    const vid = parseVideoId(input);
    if (!vid) fail('動画ファイルのパスか、YouTube の URL を渡してください');
    const ytdlp = findYtDlp();
    if (!ytdlp) {
      fail(
        'yt-dlp が見つかりません。\n' +
          '- Windows: `winget install yt-dlp.yt-dlp` と `winget install DenoLand.Deno`\n' +
          '- Linux/クラウド: `pip install -U "yt-dlp[default]"`（JS ランタイムは Node 22 以上があればそれを使う）\n' +
          'または、動画ファイルを直接渡してください。',
        2,
      );
    }
    const maxH = Number(args['max-height']) || 480;
    const url = `https://www.youtube.com/watch?v=${vid.id}`;
    const dl = [
      ...ytdlp.slice(1),
      url,
      ...jsRuntimeArgs(),
      '--no-playlist',
      '--no-progress',
      '-f',
      `bv*[height<=${maxH}]+ba/b[height<=${maxH}]/bv*+ba/b`,
      '--merge-output-format',
      'mp4',
      '-o',
      path.join(out, 'source.%(ext)s'),
    ];
    if (start != null || end != null) dl.push('--download-sections', `*${start ?? 0}-${end ?? 'inf'}`);
    if (args.subs) {
      dl.push('--write-subs', '--write-auto-subs', '--sub-langs', 'ja.*,ja,en.*,en', '--sub-format', 'vtt/best', '--convert-subs', 'vtt');
    }
    console.error(`yt-dlp で取得中（${maxH}p 以下・分析用）…`);
    const r = run(ytdlp[0], dl, { timeoutMs: 30 * 60 * 1000 });
    if (!r.ok) {
      const err = (r.stderr || r.stdout).split('\n').filter((l) => /ERROR|WARNING/.test(l)).slice(-6).join('\n');
      const hint = /Sign in to confirm|bot/i.test(err)
        ? '\n→ YouTube がボット確認を要求（クラウドの IP で起きやすい）。PC で実行するか、Gemini（yt-gemini.mjs）で読む'
        : /403|Forbidden|Unable to download|getaddrinfo|Tunnel|ProxyError/i.test(err)
          ? '\n→ 取得が拒否された。クラウドなら作業環境のネットワーク設定で *.googlevideo.com などの許可が必要'
          : /js|challenge|runtime|n challenge|signature/i.test(err)
            ? '\n→ JS ランタイムの問題。deno を入れるか、Node 22 以上で --js-runtimes node を使う（references/methods.md）'
            : '';
      fail(`yt-dlp が失敗しました：\n${err || r.stderr.slice(-800)}${hint}`, 3);
    }
    src = fs.readdirSync(out).map((f) => path.join(out, f)).find((f) => /source\.(mp4|mkv|webm|mov)$/i.test(f));
    if (!src) fail('取得したはずの動画ファイルが見つかりません');
    downloaded = true;
    if (args.subs) {
      const vtt = fs.readdirSync(out).filter((f) => f.endsWith('.vtt')).sort((a, b) => (/\.ja/.test(b) ? 1 : 0) - (/\.ja/.test(a) ? 1 : 0))[0];
      if (vtt) {
        const lines = parseVtt(fs.readFileSync(path.join(out, vtt), 'utf8'));
        writeText(path.join(out, 'transcript.txt'), [`# 字幕（yt-dlp：${vtt}）`, ...lines.map((l) => `[${fmtTime(l.t)}] ${l.text}`)].join('\n'));
        notes.push(`字幕 ${vtt} → transcript.txt（${lines.length}行）`);
      } else notes.push('字幕は見つからなかった（字幕の無い動画）');
    }
  }

  // 2) 基本情報
  const info = probe(src);
  const t0 = downloaded ? 0 : start ?? 0; // 区間取得した場合はファイル自体が区間
  const t1 = downloaded ? info.duration : end ?? info.duration;
  const span = Math.max(0, t1 - t0);
  const every = Number(args.every) || autoEvery(span);
  const [cols, rows] = String(args.grid || '4x4').split('x').map((n) => Math.max(1, Number(n) || 4));
  const width = Number(args.width) || 384;
  const trim = !downloaded && (start != null || end != null) ? `trim=start=${t0}:end=${t1},` : '';

  // 3) 一定間隔のシート（時刻を焼き込む）
  const font = findFont();
  const hasDrawtext = /drawtext/.test(run('ffmpeg', ['-hide_banner', '-filters']).stdout);
  const label =
    font && hasDrawtext
      ? `,drawtext=fontfile='${escFilterPath(font)}':text='%{pts\\:hms}':x=6:y=6:fontsize=${Math.round(width / 16)}:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=4`
      : '';
  if (!label) notes.push('コマに時刻を焼き込めなかった（書体か drawtext が無い）。時刻は下の表で確認');
  for (const f of fs.readdirSync(fdir)) if (/^sheet_\d+\.jpg$/.test(f)) fs.unlinkSync(path.join(fdir, f));
  const sheetRun = run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    src,
    '-vf',
    `${trim}fps=1/${every},scale=${width}:-2${label},tile=${cols}x${rows}:padding=4:margin=4:color=black`,
    '-fps_mode',
    'vfr',
    '-q:v',
    '3',
    path.join(fdir, 'sheet_%03d.jpg'),
  ]);
  if (!sheetRun.ok) fail(`シートの書き出しに失敗：${sheetRun.stderr.slice(0, 500)}`);
  const sheets = fs.readdirSync(fdir).filter((f) => /^sheet_\d+\.jpg$/.test(f)).sort();
  const perSheet = cols * rows;

  // 4) カット検出（場面転換の時刻）とカット長の統計
  let cuts = [];
  let shot = null;
  if (!args['no-scenes']) {
    const th = Number(args.scene) || 0.3;
    const cdir = ensureDir(path.join(fdir, 'cuts'));
    for (const f of fs.readdirSync(cdir)) fs.unlinkSync(path.join(cdir, f));
    const sc = run('ffmpeg', [
      '-hide_banner',
      '-i',
      src,
      '-vf',
      `${trim}select='gt(scene,${th})',showinfo,scale=320:-2`,
      '-fps_mode',
      'vfr',
      '-q:v',
      '4',
      path.join(cdir, 'cut_%04d.jpg'),
    ]);
    const times = [...sc.stderr.matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1]));
    cuts = times.filter((t) => t > t0 + 0.2);
    const bounds = [t0, ...cuts, t1];
    const lens = bounds.slice(1).map((b, i) => b - bounds[i]).filter((x) => x > 0.04);
    shot = stats(lens);
    writeJson(path.join(fdir, 'scenes.json'), { threshold: th, cuts, shotLengths: lens.map(r1), stats: shot });
    const cutFiles = fs.readdirSync(cdir).filter((f) => f.endsWith('.jpg')).sort();
    if (cutFiles.length > 300) notes.push(`カットが ${cutFiles.length} 個と多い。--scene を上げる（例 0.45）と実際のカットに近づく`);
    if (cutFiles.length && cutFiles.length <= 300) {
      // カットの頭のコマを 4×4 に並べた一覧（どんな画が何回出るかを見る用）
      run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        path.join(cdir, 'cut_%04d.jpg'),
        '-vf',
        'scale=320:-2,tile=4x4:padding=4:margin=4:color=black',
        '-q:v',
        '3',
        path.join(fdir, 'cuts_%02d.jpg'),
      ]);
    }
    if (shot && shot.count <= 2 && span > 60) {
      notes.push('カットがほとんど検出されない：長回し・ゆっくりしたディゾルブ・静止画の連続の可能性。--scene 0.15 で再確認するか、シートで目視');
    }
  }

  // 5) 音：ラウドネス・無音の割合・文字起こし用の音声
  let audio = null;
  if (info.hasAudio) {
    const lo = run('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', `${trim ? `atrim=start=${t0}:end=${t1},` : ''}ebur128=framelog=quiet,silencedetect=n=-45dB:d=1.5`, '-f', 'null', '-']);
    const I = lo.stderr.match(/I:\s*(-?[\d.]+)\s*LUFS/g)?.pop()?.match(/-?[\d.]+/)?.[0];
    const LRA = lo.stderr.match(/LRA:\s*(-?[\d.]+)\s*LU/g)?.pop()?.match(/-?[\d.]+/)?.[0];
    const silence = [...lo.stderr.matchAll(/silence_duration:\s*([\d.]+)/g)].reduce((a, m) => a + Number(m[1]), 0);
    audio = { lufs: I ? Number(I) : null, lra: LRA ? Number(LRA) : null, silenceSec: r1(silence), silenceRatio: span ? r1((silence / span) * 100) : null };
    if (args.audio) {
      const a = run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, ...(trim ? ['-af', `atrim=start=${t0}:end=${t1}`] : []), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', path.join(out, 'audio.wav')]);
      if (a.ok) notes.push('文字起こし用の音声 → audio.wav（16kHz モノラル）');
    }
  }

  // 6) 後片付け：取得した動画は分析用なので消す（--keep で残す）
  if (downloaded && !args.keep) {
    fs.unlinkSync(src);
    notes.push('取得した動画は分析後に削除した（残すなら --keep）');
  }

  // 7) まとめ
  const md = ['# コマ抜きの結果', ''];
  md.push(`- 入力: ${downloaded ? input : src}`);
  md.push(`- 画面: ${info.width}×${info.height}・${info.fps ?? '?'}fps（${info.height > info.width ? '縦長' : '横長'}）・${info.vcodec}`);
  md.push(`- 範囲: ${fmtTime(t0)}〜${fmtTime(t1)}（${r1(span)}秒）`);
  if (shot) {
    md.push(
      `- カット: ${shot.count} 本（切り替わり ${cuts.length} 回）。1 カットの長さ 平均 ${r1(shot.mean)}秒・中央 ${r1(shot.median)}秒・最短 ${r1(shot.min)}秒・最長 ${r1(shot.max)}秒`,
    );
  }
  if (audio) {
    md.push(
      `- 音: 平均の大きさ ${audio.lufs ?? '?'} LUFS・抑揚 ${audio.lra ?? '?'} LU・無音（-45dB 以下が 1.5 秒以上）${audio.silenceSec}秒（${audio.silenceRatio ?? '?'}%）`,
    );
  } else md.push('- 音: 音声トラックなし');
  md.push('', `## 一定間隔のシート（1 コマ = ${every}秒、${cols}列×${rows}行、左上から右へ）`, '| ファイル | 時間帯 |', '|---|---|');
  sheets.forEach((f, i) => {
    const a = t0 + i * perSheet * every;
    const b = Math.min(t1, a + perSheet * every);
    md.push(`| ${f} | ${fmtTime(a)}〜${fmtTime(b)} |`);
  });
  if (cuts.length) {
    md.push('', '## カットの切り替わり（秒）', cuts.slice(0, 200).map((t) => fmtTime(t)).join(' / ') + (cuts.length > 200 ? ' …' : ''));
    md.push('', '- cuts/cut_*.jpg：各カットの頭のコマ。cuts_*.jpg：それを 16 枚ずつ並べたもの（左上から右へ、番号順）');
  }
  if (notes.length) md.push('', '## メモ', ...notes.map((n) => `- ${n}`));
  md.push('', '## 見方', '- シートを Read で開いて、色・構図・動き・文字・つなぎを見る。気になる時刻は `--start/--end` と `--every 1` で細かく抜き直す');
  writeText(path.join(fdir, 'index.md'), md.join('\n'));
  writeJson(path.join(fdir, 'probe.json'), { ...info, every, cols, rows, t0, t1, audio, shots: shot });
  console.log(md.join('\n'));
  console.log(`\n保存先: ${fdir}`);
}

main().catch((e) => fail(`予期しないエラー: ${e?.stack || e}`));
