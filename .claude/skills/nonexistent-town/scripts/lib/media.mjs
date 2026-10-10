// ffmpeg まわりの部品：書体さがし・フィルタ用のエスケープ・実行・長さの取得
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run } from './common.mjs';

const WIN_FONTS = path.join(process.env.WINDIR || 'C:/Windows', 'Fonts');
const HOME_FONTS = [path.join(os.homedir(), '.fonts'), path.join(os.homedir(), '.local/share/fonts')];

// 日本語が出る書体の候補（上ほど優先）。--font やエピソードの fonts.* で直接指定もできる
const CANDIDATES = {
  mincho: [
    path.join(WIN_FONTS, 'yumin.ttf'),
    path.join(WIN_FONTS, 'YuMincho.ttc'),
    path.join(WIN_FONTS, 'msmincho.ttc'),
    '/usr/share/fonts/opentype/ipafont-mincho/ipam.ttf',
    '/usr/share/fonts/truetype/fonts-japanese-mincho.ttf',
    '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
    '/usr/share/fonts/noto-cjk/NotoSerifCJK-Regular.ttc',
    '/System/Library/Fonts/ヒラギノ明朝 ProN.ttc',
    '/Library/Fonts/Hiragino Mincho ProN.ttc',
  ],
  gothic: [
    path.join(WIN_FONTS, 'YuGothM.ttc'),
    path.join(WIN_FONTS, 'meiryo.ttc'),
    path.join(WIN_FONTS, 'msgothic.ttc'),
    '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',
    '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
    '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc',
  ],
  mono: [
    path.join(WIN_FONTS, 'consola.ttf'),
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf',
    '/System/Library/Fonts/Menlo.ttc',
  ],
};

/**
 * 書体のパスを返す。kind は mincho / gothic / mono、またはファイルのパス。
 * 作業フォルダの fonts/ に置いた書体も探す。見つからなければ null。
 */
export function findFont(kind, workDir) {
  if (kind && /\.(ttf|otf|ttc)$/i.test(kind)) {
    const p = path.resolve(workDir || '.', kind);
    return fs.existsSync(p) ? p : null;
  }
  const list = [...(CANDIDATES[kind] || CANDIDATES.gothic)];
  for (const dir of [workDir && path.join(workDir, 'fonts'), ...HOME_FONTS].filter(Boolean)) {
    try {
      for (const f of fs.readdirSync(dir)) if (/\.(ttf|otf|ttc)$/i.test(f)) list.push(path.join(dir, f));
    } catch {
      /* 無いフォルダは飛ばす */
    }
  }
  return list.find((f) => fs.existsSync(f)) || (kind === 'mono' ? findFont('gothic', workDir) : kind === 'mincho' ? findFont('gothic', workDir) : null);
}

/** ffmpeg のフィルタ引数に入れるパス（Windows の C: などをエスケープ） */
export function escPath(p) {
  return String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/** ffmpeg を実行し、失敗したら最後のエラーを添えて例外にする */
export function ffmpeg(args, { label = 'ffmpeg', timeoutMs = 0 } = {}) {
  const r = run('ffmpeg', ['-hide_banner', '-y', ...args], { timeoutMs });
  if (!r.found) throw new Error('ffmpeg が見つかりません（Windows：winget install ffmpeg ／ Linux：apt-get install -y ffmpeg）');
  if (!r.ok) {
    const tail = r.stderr.split('\n').filter(Boolean).slice(-12).join('\n');
    throw new Error(`${label} に失敗しました：\n${tail}`);
  }
  return r;
}

/** 長さ（秒）と映像・音声の有無 */
export function probe(file) {
  const r = run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  if (!r.ok) throw new Error(`ffprobe で読めません：${file}\n${r.stderr.slice(0, 300)}`);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find((s) => s.codec_type === 'video');
  const a = j.streams.find((s) => s.codec_type === 'audio');
  const [n, d] = String(v?.avg_frame_rate || '0/1').split('/').map(Number);
  return {
    duration: Number(j.format?.duration) || 0,
    videoDuration: Number(v?.duration) || Number(j.format?.duration) || 0,
    audioDuration: Number(a?.duration) || 0,
    width: v?.width,
    height: v?.height,
    fps: d ? n / d : null,
    hasVideo: Boolean(v),
    hasAudio: Boolean(a),
    sampleRate: a ? Number(a.sample_rate) : null,
  };
}

/** 平均の大きさ（LUFS）と最大ピーク（dBTP）を測る */
export function measureLoudness(file) {
  const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  const I = r.stderr.match(/I:\s*(-?[\d.]+)\s*LUFS/g)?.pop()?.match(/-?[\d.]+/)?.[0];
  const peak = r.stderr.match(/Peak:\s*(-?[\d.]+)\s*dBFS/g)?.pop()?.match(/-?[\d.]+/)?.[0];
  return { lufs: I != null ? Number(I) : null, truePeak: peak != null ? Number(peak) : null };
}
