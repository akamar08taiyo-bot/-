/**
 * X・note などに貼る「日別まとめ画像」を canvas で描く（1200×675、Xのカード比率 16:9）。
 * 表の全台一覧は載せず、集計値と上位だけを載せる。
 */
import {dayReport} from './analyze';
import {pct, shortDate, signed} from './format';
import type {SlotRow} from './types';

const W = 1200;
const H = 675;
const C = {
  bg: '#0f172a',
  panel: '#1e293b',
  text: '#f8fafc',
  sub: '#94a3b8',
  plus: '#60a5fa',
  minus: '#f87171',
  accent: '#fbbf24',
};
const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';

function color(v: number): string {
  return v > 0 ? C.plus : v < 0 ? C.minus : C.sub;
}

/** 幅に収まるよう末尾を「…」で切る */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export function drawDayImage(canvas: HTMLCanvasElement, rows: SlotRow[], date: string, store: string, credit: string): void {
  const rep = dayReport(rows, date);
  const s = rep.summary;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  // 見出し
  ctx.fillStyle = C.sub;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(`${date.slice(0, 4)} ${shortDate(date)}`, 56, 78);
  ctx.fillStyle = C.text;
  ctx.font = `800 48px ${FONT}`;
  ctx.fillText(fit(ctx, store, W - 112), 56, 138);

  // 店トータル（主役の数字）
  ctx.fillStyle = C.sub;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText('店トータル差枚', 56, 214);
  ctx.fillStyle = color(s.totalDiff);
  ctx.font = `900 104px ${FONT}`;
  const total = `${signed(s.totalDiff)}`;
  ctx.fillText(total, 50, 318);
  const tw = ctx.measureText(total).width;
  ctx.fillStyle = C.sub;
  ctx.font = `700 36px ${FONT}`;
  ctx.fillText('枚', 58 + tw, 318);

  // サブ指標
  const stats: [string, string][] = [
    ['台数', `${s.count}台`],
    ['1台平均', `${signed(s.avgDiff)}枚`],
    ['勝率', pct(s.winRate, 0)],
    ['出率', pct(s.payout)],
  ];
  stats.forEach(([label, value], i) => {
    const x = 56 + i * 140;
    ctx.fillStyle = C.sub;
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(label, x, 380);
    ctx.fillStyle = C.text;
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText(value, x, 420);
  });

  // 右：強かった機種
  const px = 640;
  ctx.fillStyle = C.panel;
  ctx.beginPath();
  // roundRect が無い古いブラウザ（iOS 15以前など）では角丸なしで描く
  if (typeof ctx.roundRect === 'function') ctx.roundRect(px, 186, W - px - 48, 250, 20);
  else ctx.rect(px, 186, W - px - 48, 250);
  ctx.fill();
  ctx.fillStyle = C.accent;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText('強かった機種（平均差枚）', px + 28, 226);
  rep.machines
    .slice()
    .sort((a, b) => b.avgDiff - a.avgDiff)
    .slice(0, 4)
    .forEach((m, i) => {
      const y = 276 + i * 44;
      ctx.fillStyle = C.text;
      ctx.font = `600 26px ${FONT}`;
      ctx.fillText(fit(ctx, m.key, 300), px + 28, y);
      ctx.fillStyle = color(m.avgDiff);
      ctx.font = `800 26px ${FONT}`;
      const v = signed(m.avgDiff);
      ctx.fillText(v, W - 76 - ctx.measureText(v).width, y);
    });

  // 下段：末尾別の棒
  const tails = [...rep.tails].sort((a, b) => a.key.localeCompare(b.key));
  const maxAbs = Math.max(1, ...tails.map((t) => Math.abs(t.avgDiff)));
  const baseY = 560;
  const barW = 76;
  ctx.fillStyle = C.sub;
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('末尾別 平均差枚', 56, 476);
  ctx.strokeStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(56, baseY);
  ctx.lineTo(W - 48, baseY);
  ctx.stroke();
  tails.forEach((t, i) => {
    const x = 56 + i * ((W - 104) / 10) + 10;
    const h = (Math.abs(t.avgDiff) / maxAbs) * 52;
    ctx.fillStyle = color(t.avgDiff);
    ctx.fillRect(x, t.avgDiff >= 0 ? baseY - h : baseY, barW, h);
    ctx.fillStyle = C.text;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(t.key.replace('末尾', ''), x + barW / 2 - 6, 640);
  });

  // クレジット
  ctx.fillStyle = C.sub;
  ctx.font = `500 18px ${FONT}`;
  const foot = credit || '※過去データの集計であり結果を保証するものではありません';
  ctx.fillText(fit(ctx, foot, W - 112), W - 56 - Math.min(ctx.measureText(foot).width, W - 112), 664);
}
