import type {Clip, ProjectSettings} from './types';

/**
 * 1フレームを Canvas へ描く処理。
 *
 * プレビューと書き出しで同じ関数を使い、「見えている絵」と「出力される絵」が
 * 食い違わないようにしている。時刻 t（秒）だけを入力とする純粋な描画にしてあるため、
 * シークしても再生しても同じ結果になる。
 */

/** Ken Burns 効果の拡大量（1.0 → 1.0 + この値） */
const ZOOM_AMOUNT = 0.12;
/** パン時に左右へ動かす余地を作るための固定ズーム */
const PAN_ZOOM = 1.14;

/** 出力解像度。エンコーダーが扱いやすいよう偶数へ丸める */
export function frameSize(settings: ProjectSettings): {width: number; height: number} {
  const short = Math.max(16, Math.round(settings.resolution));
  const long = Math.round((short * 16) / 9);
  const even = (v: number) => (v % 2 === 0 ? v : v + 1);
  if (settings.aspect === '16:9') return {width: even(long), height: even(short)};
  if (settings.aspect === '9:16') return {width: even(short), height: even(long)};
  return {width: even(short), height: even(short)};
}

/** 全カットの合計秒数。クロスフェードは各カットの持ち時間の中で行うため単純な総和になる */
export function totalDuration(clips: Clip[]): number {
  return clips.reduce((sum, c) => sum + Math.max(0, c.durationSec), 0);
}

/** 各カットの開始時刻（先頭からの累計） */
export function clipStartTimes(clips: Clip[]): number[] {
  const starts: number[] = [];
  let acc = 0;
  for (const c of clips) {
    starts.push(acc);
    acc += Math.max(0, c.durationSec);
  }
  return starts;
}

/** 時刻 t にどのカットを表示しているか */
export function clipAtTime(clips: Clip[], t: number): {index: number; local: number; progress: number} | null {
  if (clips.length === 0) return null;
  const total = totalDuration(clips);
  const time = Math.min(Math.max(0, t), Math.max(0, total - 1e-6));
  const starts = clipStartTimes(clips);
  let index = clips.length - 1;
  for (let i = 0; i < clips.length; i++) {
    const end = starts[i] + Math.max(0, clips[i].durationSec);
    if (time < end) {
      index = i;
      break;
    }
  }
  const duration = Math.max(1e-6, clips[index].durationSec);
  const local = time - starts[index];
  return {index, local, progress: Math.min(1, Math.max(0, local / duration))};
}

/**
 * 文字の折り返し。
 *
 * 日本語は単語の区切りに空白が無いので、空白があればそこで、無ければ1文字ずつ折る。
 * 行頭に句読点や閉じ括弧が来た場合は1文字前の行へ送る（簡易的な禁則処理）。
 */
const NO_LINE_START = '、。，．・！？』」）］｝〉》”’!?,.:;)]}';

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    let line = '';
    let lastSpace = -1;
    for (const char of paragraph) {
      const candidate = line + char;
      if (line !== '' && ctx.measureText(candidate).width > maxWidth) {
        // 空白区切りがあればそこまでを1行にする（英単語を途中で割らない）
        if (lastSpace > 0) {
          lines.push(line.slice(0, lastSpace).trimEnd());
          line = line.slice(lastSpace + 1) + char;
        } else if (NO_LINE_START.includes(char)) {
          // 行頭禁則：この文字は前の行に残す
          lines.push(candidate);
          line = '';
        } else {
          lines.push(line);
          line = char;
        }
        lastSpace = line.lastIndexOf(' ');
      } else {
        line = candidate;
        if (char === ' ') lastSpace = line.length - 1;
      }
    }
    if (line !== '') lines.push(line);
  }
  return lines;
}

function captionFont(sizePx: number, bold: boolean): string {
  return `${bold ? 700 : 500} ${sizePx}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", sans-serif`;
}

/** 画像をフレームへ収める矩形を求める（動きを含む） */
function imageRect(
  width: number,
  height: number,
  image: HTMLImageElement,
  motion: Clip['motion'],
  progress: number,
  fit: ProjectSettings['fit'],
): {dx: number; dy: number; dw: number; dh: number} {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const base = fit === 'contain' ? Math.min(width / iw, height / ih) : Math.max(width / iw, height / ih);

  let zoom = 1;
  if (motion === 'zoomIn') zoom = 1 + ZOOM_AMOUNT * progress;
  else if (motion === 'zoomOut') zoom = 1 + ZOOM_AMOUNT * (1 - progress);
  else if (motion === 'panLeft' || motion === 'panRight') zoom = PAN_ZOOM;

  const dw = iw * base * zoom;
  const dh = ih * base * zoom;

  // パンは「はみ出している分」の範囲内でだけ動かす（余白が見えないようにする）
  let offsetX = 0;
  if (motion === 'panLeft' || motion === 'panRight') {
    const room = Math.max(0, (dw - width) / 2);
    const direction = motion === 'panLeft' ? -1 : 1;
    offsetX = direction * room * (progress * 2 - 1);
  }

  return {dx: (width - dw) / 2 + offsetX, dy: (height - dh) / 2, dw, dh};
}

/** テロップと、その背後の暗幕を描く */
function drawCaption(ctx: CanvasRenderingContext2D, width: number, height: number, clip: Clip, s: ProjectSettings) {
  const title = clip.title.trim();
  const subtitle = clip.subtitle.trim();
  if (title === '' && subtitle === '') return;

  const margin = Math.round(height * 0.06);
  const maxWidth = width - margin * 2;
  const titleSize = Math.round(height * 0.068 * s.fontScale);
  const subSize = Math.round(height * 0.04 * s.fontScale);
  const titleLeading = Math.round(titleSize * 1.35);
  const subLeading = Math.round(subSize * 1.45);
  const gap = title && subtitle ? Math.round(titleSize * 0.45) : 0;

  ctx.font = captionFont(titleSize, true);
  const titleLines = title ? wrapText(ctx, title, maxWidth) : [];
  ctx.font = captionFont(subSize, false);
  const subLines = subtitle ? wrapText(ctx, subtitle, maxWidth) : [];

  const blockHeight = titleLines.length * titleLeading + gap + subLines.length * subLeading;

  let top: number;
  if (s.captionPosition === 'top') top = margin;
  else if (s.captionPosition === 'center') top = (height - blockHeight) / 2;
  else top = height - margin - blockHeight;

  if (s.captionScrim) {
    // 写真の明暗に関わらず文字が読めるよう、テロップ側だけ暗く落とす。
    // 端だけを濃くすると文字の位置で薄くなってしまうので、
    // 文字が乗っている範囲そのものが濃くなるよう、文字の上下端に色の区切りを置く。
    const pad = Math.round(height * 0.09);
    const from = Math.max(0, top - pad);
    const to = Math.min(height, top + blockHeight + pad);
    const span = Math.max(1, to - from);
    const textStart = Math.min(1, Math.max(0, (top - from) / span));
    const textEnd = Math.min(1, Math.max(textStart, (top + blockHeight - from) / span));
    const gradient = ctx.createLinearGradient(0, from, 0, to);
    if (s.captionPosition === 'top') {
      gradient.addColorStop(0, 'rgba(0,0,0,0.72)');
      gradient.addColorStop(textEnd, 'rgba(0,0,0,0.55)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
    } else if (s.captionPosition === 'bottom') {
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(textStart, 'rgba(0,0,0,0.55)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.72)');
    } else {
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(textStart, 'rgba(0,0,0,0.6)');
      gradient.addColorStop(textEnd, 'rgba(0,0,0,0.6)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, from, width, to - from);
  }

  const x = s.captionAlign === 'center' ? width / 2 : margin;
  ctx.textAlign = s.captionAlign === 'center' ? 'center' : 'left';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';

  let y = top;
  ctx.fillStyle = s.captionColor;
  ctx.font = captionFont(titleSize, true);
  ctx.lineWidth = Math.max(2, titleSize * 0.09);
  for (const line of titleLines) {
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    y += titleLeading;
  }
  y += gap;
  ctx.font = captionFont(subSize, false);
  ctx.lineWidth = Math.max(2, subSize * 0.09);
  for (const line of subLines) {
    ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
    y += subLeading;
  }
}

/** 1カットを（クロスフェード用の）オフスクリーンへ完成形で描く */
function drawClipComposition(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clip: Clip,
  progress: number,
  s: ProjectSettings,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = s.backgroundColor;
  ctx.fillRect(0, 0, width, height);
  const image = clip.image;
  if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
    const {dx, dy, dw, dh} = imageRect(width, height, image, clip.motion, progress, s.fit);
    ctx.drawImage(image, dx, dy, dw, dh);
  }
  drawCaption(ctx, width, height, clip, s);
}

/** クロスフェード用のオフスクリーン。毎フレーム作り直すと重いので使い回す */
const buffers: {canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D}[] = [];

function buffer(slot: number, width: number, height: number) {
  if (!buffers[slot]) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D コンテキストを取得できませんでした');
    buffers[slot] = {canvas, ctx};
  }
  const entry = buffers[slot];
  if (entry.canvas.width !== width || entry.canvas.height !== height) {
    entry.canvas.width = width;
    entry.canvas.height = height;
  }
  return entry;
}

/** 素材が無いときの案内。真っ白な画面で迷わせないための表示 */
function drawPlaceholder(ctx: CanvasRenderingContext2D, width: number, height: number, s: ProjectSettings) {
  ctx.fillStyle = s.backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = captionFont(Math.round(height * 0.05), false);
  ctx.fillText('画像を追加するとここに表示されます', width / 2, height / 2);
}

/**
 * 時刻 t（秒）のフレームを描く。
 *
 * カットの先頭 transitionSec の間は、前のカットの最終状態の上へ次のカットを重ねて
 * 徐々に不透明にする。1カット目は前のカットが無いのでフェードせず、最初から表示する
 * （画像を追加した直後に背景色だけの画面が出ると、動いていないように見えるため）。
 */
export function drawFrame(ctx: CanvasRenderingContext2D, clips: Clip[], s: ProjectSettings, time: number) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  const at = clipAtTime(clips, time);
  if (!at) {
    drawPlaceholder(ctx, width, height, s);
    return;
  }

  const current = clips[at.index];
  const fadeSec = Math.max(0, Math.min(s.transitionSec, current.durationSec));
  const fading = at.index > 0 && fadeSec > 0 && at.local < fadeSec;

  if (!fading) {
    drawClipComposition(ctx, width, height, current, at.progress, s);
    return;
  }

  const alpha = Math.min(1, Math.max(0, at.local / fadeSec));
  const back = buffer(0, width, height);
  const front = buffer(1, width, height);

  // 前のカットの「最後の瞬間」を下敷きにして、その上へ次のカットを重ねる
  drawClipComposition(back.ctx, width, height, clips[at.index - 1], 1, s);
  drawClipComposition(front.ctx, width, height, current, at.progress, s);

  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.drawImage(back.canvas, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(front.canvas, 0, 0);
  ctx.globalAlpha = 1;
}

/** 秒数を "0:05" 形式にする */
export function formatTime(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
