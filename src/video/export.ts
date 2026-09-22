import {startBgm} from './audio';
import type {BgmSettings} from './types';

/**
 * Canvas の内容を MediaRecorder で録画して動画ファイルにする。
 *
 * 実時間での録画になるため、30秒の動画の書き出しには約30秒かかる。
 * ブラウザによって作れる形式が違うので、SNS で扱いやすい MP4 を優先し、
 * 対応していなければ WebM へ落とす。
 */

export interface RecorderFormat {
  mimeType: string;
  extension: string;
  label: string;
  /** SNS などでそのまま使えるか（WebM は変換が要る場合がある） */
  widelySupported: boolean;
}

/**
 * 候補の並び順には理由がある。
 *
 * H.264 の MP4 が作れるならそれが最も扱いやすい（SNS・スマホ・編集ソフトでそのまま開ける）。
 * 一方で codecs を指定しない 'video/mp4' は、ブラウザによって VP9 を MP4 に詰めたファイルを
 * 返すことがある。拡張子は .mp4 でも中身は VP9 なので、ブラウザ以外ではほぼ再生できない。
 * そのため codecs 無しの MP4 は WebM より後ろに置き、最後の手段としてだけ使う。
 */
const CANDIDATES: RecorderFormat[] = [
  {mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4', label: 'MP4 (H.264 / AAC)', widelySupported: true},
  {mimeType: 'video/mp4;codecs=avc1.4D401E,mp4a.40.2', extension: 'mp4', label: 'MP4 (H.264 / AAC)', widelySupported: true},
  {mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm', label: 'WebM (VP9 / Opus)', widelySupported: false},
  {mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm', label: 'WebM (VP8 / Opus)', widelySupported: false},
  {mimeType: 'video/webm', extension: 'webm', label: 'WebM', widelySupported: false},
  {mimeType: 'video/mp4', extension: 'mp4', label: 'MP4（コーデック不明）', widelySupported: false},
];

/**
 * 実際に録画へ使われた MIME から形式を判定する。
 *
 * MediaRecorder は要求した形式と違うものを返すことがあるため、
 * 保存時の拡張子と画面の表示は「実際に出来上がったもの」に合わせる。
 */
export function describeMime(mimeType: string): RecorderFormat {
  const known = CANDIDATES.find((c) => c.mimeType.toLowerCase() === mimeType.toLowerCase());
  if (known) return known;
  const base = mimeType.split(';')[0].trim().toLowerCase();
  const codecs = /codecs=\"?([^;\"]*)/i.exec(mimeType)?.[1] ?? '';
  const isMp4 = base === 'video/mp4';
  const isH264 = /avc1|h264/i.test(codecs);
  return {
    mimeType,
    extension: isMp4 ? 'mp4' : 'webm',
    label: `${isMp4 ? 'MP4' : 'WebM'}${codecs ? ` (${codecs})` : ''}`,
    widelySupported: isMp4 && isH264,
  };
}

/** この環境で書き出しが可能か */
export function canExport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    pickFormat() !== null
  );
}

/** 使える形式のうち最も扱いやすいものを選ぶ */
export function pickFormat(): RecorderFormat | null {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return null;
  for (const candidate of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate.mimeType)) return candidate;
    } catch {
      // isTypeSupported 自体が無い環境は次の候補へ
    }
  }
  return null;
}

/** 解像度とフレームレートから妥当なビットレートを決める（2〜16Mbps に収める） */
function videoBitrate(width: number, height: number, fps: number): number {
  const raw = width * height * fps * 0.1;
  return Math.round(Math.min(16_000_000, Math.max(2_000_000, raw)));
}

export class ExportCancelled extends Error {
  constructor() {
    super('書き出しを中止しました');
    this.name = 'ExportCancelled';
  }
}

export interface ExportParams {
  canvas: HTMLCanvasElement;
  fps: number;
  totalSec: number;
  /** 時刻 t（秒）のフレームを canvas へ描く */
  drawAt: (t: number) => void;
  /** BGM を混ぜる場合の音声文脈と設定 */
  audio?: {context: AudioContext; bgm: BgmSettings} | null;
  onProgress?: (ratio: number) => void;
  /** true を返すと録画を打ち切る */
  shouldCancel?: () => boolean;
}

export async function exportVideo(params: ExportParams): Promise<{blob: Blob; format: RecorderFormat}> {
  const format = pickFormat();
  if (!format) throw new Error('このブラウザは動画の書き出しに対応していません');
  if (params.totalSec <= 0) throw new Error('書き出す長さがありません');

  const {canvas, fps, totalSec, drawAt} = params;
  const stream = canvas.captureStream(fps);
  const addedTracks: MediaStreamTrack[] = [];
  let bgmPlayback: {stop(): void} | null = null;
  let audioDestination: MediaStreamAudioDestinationNode | null = null;

  if (params.audio) {
    // 音声トラックは MediaRecorder を作る前に stream へ足しておく必要がある。
    // ただし再生の開始は録画開始と揃える（先に鳴らすと音だけ先行し、終端のフェードもずれる）。
    audioDestination = params.audio.context.createMediaStreamDestination();
    for (const track of audioDestination.stream.getAudioTracks()) {
      stream.addTrack(track);
      addedTracks.push(track);
    }
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: videoBitrate(canvas.width, canvas.height, fps),
    audioBitsPerSecond: 128_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, {type: format.mimeType}));
    recorder.onerror = () => reject(new Error('録画中にエラーが発生しました'));
  });

  let cancelled = false;
  let frameHandle = 0;

  const cleanup = () => {
    if (frameHandle) cancelAnimationFrame(frameHandle);
    bgmPlayback?.stop();
    for (const track of addedTracks) {
      stream.removeTrack(track);
      track.stop();
    }
    audioDestination?.disconnect();
  };

  // 最初のフレームを描いてから録画を始める（先頭が空フレームにならないようにする）
  drawAt(0);
  recorder.start(1000);
  const startedAt = performance.now();
  if (params.audio && audioDestination) {
    bgmPlayback = startBgm(params.audio.context, params.audio.bgm, audioDestination, totalSec, 0);
  }

  await new Promise<void>((resolve) => {
    const step = () => {
      if (params.shouldCancel?.()) {
        cancelled = true;
        resolve();
        return;
      }
      const elapsed = (performance.now() - startedAt) / 1000;
      if (elapsed >= totalSec) {
        // 最終フレームを確実に1枚残してから止める
        drawAt(totalSec);
        params.onProgress?.(1);
        resolve();
        return;
      }
      drawAt(elapsed);
      params.onProgress?.(Math.min(1, elapsed / totalSec));
      frameHandle = requestAnimationFrame(step);
    };
    frameHandle = requestAnimationFrame(step);
  });

  // 直前に描いたフレームが取り込まれるよう、1フレーム分だけ待ってから停止する
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (recorder.state !== 'inactive') recorder.stop();

  try {
    const blob = await finished;
    if (cancelled) throw new ExportCancelled();
    // 要求した形式と実際の形式がずれることがあるので、出来上がったものを正として扱う
    const actual = recorder.mimeType ? describeMime(recorder.mimeType) : format;
    return {blob, format: actual};
  } finally {
    cleanup();
  }
}

/** Blob をダウンロードさせる */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 実際のダウンロード開始前に失効しないよう、少し待ってから解放する
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
