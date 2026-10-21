// 横長（16:9）の会話劇の部品。カット（絵＋カメラ）、字幕、時刻・場所、分析カード、メモ、スマホ、題字。
// 時刻はすべて台本の行・場面を基準にした「アンカー」（S01+0、s01_1.s-3.2、s01_1.e+0.5、end-5）で書く。秒の直書きはしない。
import React from 'react';
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {F} from './fonts';

export const DW = 1920;
export const DH = 1080;

export type DramaLine = {id: string; start: number; end: number; breaks?: number[]};
export type DramaTimeline = {fps: number; total: number; scenes: Record<string, number>; lines: DramaLine[]};
export type Anchors = {sec: (a: string) => number; f: (a: string) => number; fps: number; total: number};

/** アンカーを秒・フレームにする */
export const makeAnchors = (tl: DramaTimeline): Anchors => {
  const L: Record<string, DramaLine> = Object.fromEntries(tl.lines.map((l) => [l.id, l]));
  const num = (s?: string) => (s ? Number(s) : 0);
  const sec = (a: string) => {
    let m = a.match(/^(S\d+)([+-]\d+(?:\.\d+)?)?$/);
    if (m) {
      if (tl.scenes[m[1]] === undefined) throw new Error(`timeline に場面 ${m[1]} がありません`);
      return tl.scenes[m[1]] + num(m[2]);
    }
    m = a.match(/^(s\d+_\d+)\.(s|e)([+-]\d+(?:\.\d+)?)?$/);
    if (m) {
      const l = L[m[1]];
      if (!l) throw new Error(`timeline に行 ${m[1]} がありません`);
      return (m[2] === 's' ? l.start : l.end) + num(m[3]);
    }
    m = a.match(/^end([+-]\d+(?:\.\d+)?)?$/);
    if (m) return tl.total + num(m[1]);
    throw new Error(`アンカーの書き方が違います: ${a}`);
  };
  return {sec, f: (a) => Math.round(sec(a) * tl.fps), fps: tl.fps, total: Math.ceil(tl.total * tl.fps)};
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = Easing.inOut(Easing.sin);
/** a〜b フレームで 0→1 */
export const ramp = (frame: number, a: number, b: number, ease = Easing.inOut(Easing.cubic)) =>
  b <= a ? (frame >= a ? 1 : 0) : interpolate(frame, [a, b], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
/** from〜to の間だけ見える不透明度（fin/fout はフレーム数） */
export const life = (frame: number, from: number, to: number, fin = 8, fout = 8) =>
  Math.min(ramp(frame, from, from + fin), 1 - ramp(frame, to - fout, to));

// ---- カット ----

/** cam: [x, y, 始めの拡大率, 終わりの拡大率] か [x0, y0, z0, x1, y1, z1]（x, y は絵の上の注目点 0〜1） */
export type Shot = {
  id: string;
  img: string; // 絵の名前（public/<回>/img/<img>.jpg）
  from: number;
  to: number;
  cam: number[];
  blur?: number; // カード・メモの後ろでぼかす（px）。ぼかした絵 <img>_b<px>.jpg を使う（gen_shots.py --publish が作る）
  sweep?: boolean; // 外を通る車のライトが横切る
  steam?: number[][]; // [x, y, 大きさ] 絵の上の湯気の位置
  glow?: number; // ホールの台の光のゆらぎ（強さ）
  dim?: [number, number]; // [暗くし始め, 暗くし終わり]（フレーム）灯りを消す
  fadeIn?: number; // 頭のフェード（フレーム）
  iw: number;
  ih: number;
};

const camAt = (s: Shot, frame: number) => {
  const p = smooth(clamp01((frame - s.from) / Math.max(1, s.to - s.from)));
  const c = s.cam.length === 6 ? s.cam : [s.cam[0], s.cam[1], s.cam[2], s.cam[0], s.cam[1], s.cam[3]];
  return {fx: c[0] + (c[3] - c[0]) * p, fy: c[1] + (c[4] - c[1]) * p, z: c[2] + (c[5] - c[2]) * p};
};

export const placeShot = (s: Shot, frame: number) => {
  const {fx, fy, z} = camAt(s, frame);
  const k = Math.max(DW / s.iw, DH / s.ih) * z;
  const w = s.iw * k;
  const h = s.ih * k;
  const left = Math.min(0, Math.max(DW - w, DW / 2 - fx * w));
  const top = Math.min(0, Math.max(DH - h, DH / 2 - fy * h));
  return {left, top, w, h};
};

/** 湯気：ゆっくり昇って消える薄い筋（乱数を使わず、フレームから決まる） */
const Steam: React.FC<{x: number; y: number; size: number; frame: number}> = ({x, y, size, frame}) => (
  <>
    {[0, 1, 2, 3, 4].map((i) => {
      const period = 70 + i * 9;
      const t = ((frame + i * 23) % period) / period;
      const rise = t * 220 * size;
      const sway = Math.sin((frame + i * 40) / 17) * 18 * size + (i - 2) * 14 * size;
      const op = Math.sin(Math.PI * t) * 0.22;
      return (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: x + sway - 40 * size,
            top: y - rise - 60 * size,
            width: 80 * size,
            height: 140 * size,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.25) 35%, rgba(255,255,255,0) 70%)',
            opacity: op,
          }}
        />
      );
    })}
  </>
);

export const ShotView: React.FC<{s: Shot; ep: string}> = ({s, ep}) => {
  const frame = useCurrentFrame();
  if (frame < s.from || frame >= s.to) return null;
  const pl = placeShot(s, frame);
  // 文字・リールのぼかし（masks）は絵に焼き込み済み。カードの後ろはぼかした絵を使う（どちらも CSS でぼかすと重い）
  const src = staticFile(`${ep}/img/${s.img}${s.blur ? `_b${s.blur}` : ''}.jpg`);
  const at = (nx: number, ny: number) => ({x: pl.left + nx * pl.w, y: pl.top + ny * pl.h});
  const scale = pl.w / DW;
  const opacity = s.fadeIn ? ramp(frame, s.from, s.from + s.fadeIn, Easing.linear) : 1;
  const sweepP = s.sweep ? ramp(frame, s.from + 0.35 * (s.to - s.from), s.from + 0.35 * (s.to - s.from) + 40, Easing.inOut(Easing.quad)) : 0;
  const dim = s.dim ? ramp(frame, s.dim[0], s.dim[1], Easing.out(Easing.quad)) : 0;
  return (
    <AbsoluteFill style={{opacity}}>
      <Img src={src} style={{position: 'absolute', left: pl.left, top: pl.top, width: pl.w, height: pl.h}} />
      {!s.blur &&
        s.steam?.map(([x, y, size], i) => {
          const p = at(x, y);
          return <Steam key={i} x={p.x} y={p.y} size={size * scale} frame={frame} />;
        })}
      {s.glow ? (
        <AbsoluteFill
          style={{
            mixBlendMode: 'soft-light',
            opacity: s.glow * (0.55 + 0.45 * Math.sin(frame / 5.3) * Math.sin(frame / 2.1 + 1)),
            background: `radial-gradient(ellipse at ${30 + 20 * Math.sin(frame / 9)}% 45%, hsla(${(frame * 7) % 360}, 90%, 60%, 0.9) 0%, rgba(0,0,0,0) 60%)`,
          }}
        />
      ) : null}
      {s.sweep ? (
        <AbsoluteFill
          style={{
            mixBlendMode: 'screen',
            opacity: Math.sin(Math.PI * sweepP) * 0.55,
            background: `linear-gradient(105deg, rgba(0,0,0,0) ${-40 + sweepP * 160}%, rgba(255,236,200,0.9) ${-25 + sweepP * 160}%, rgba(0,0,0,0) ${-10 + sweepP * 160}%)`,
          }}
        />
      ) : null}
      {dim ? <AbsoluteFill style={{background: '#05060a', opacity: dim * 0.92}} /> : null}
    </AbsoluteFill>
  );
};

// ---- 字幕 ----

export type SubLine = {id: string; text: string; sub?: string; style: string; phone?: boolean};
export type SubEvent = {from: number; to: number; text: string; kind: 'talk' | 'inner' | 'phone'; who?: string};

/** 句点などで文に分け、1行に収まる長さ（max 文字）ごとにまとめる */
const chunks = (text: string, max: number) => {
  const sent = (text.match(/[^。？！]+[。？！]?/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
  const parts: string[] = [];
  for (const s of sent) {
    if (s.length <= max) {
      parts.push(s);
      continue;
    }
    // 長い文は真ん中に近い読点で分ける
    const mid = s.length / 2;
    let best = -1;
    for (let i = 0; i < s.length; i++) if (s[i] === '、' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
    if (best > 0) parts.push(s.slice(0, best + 1), s.slice(best + 1));
    else parts.push(s);
  }
  const out: string[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (last !== undefined && (last + p).length <= max && !/[、]$/.test(last)) out[out.length - 1] = last + p;
    else out.push(p);
  }
  return out;
};

const tidy = (s: string) =>
  s
    .replace(/。$/, '')
    .replace(/、$/, '')
    .replace(/。/g, '　')
    .trim();

/** 行の声の長さを、文の文字数と息継ぎ（breaks）で分けて、字幕の出入りを決める */
export const subtitleEvents = (lines: SubLine[], tl: DramaTimeline, isInner: (l: SubLine) => boolean, max = 24): SubEvent[] => {
  const T: Record<string, DramaLine> = Object.fromEntries(tl.lines.map((l) => [l.id, l]));
  const ev: SubEvent[] = [];
  lines.forEach((l, li) => {
    const t = T[l.id];
    const next = lines[li + 1] ? T[lines[li + 1].id] : undefined;
    const cs = chunks(l.sub ?? l.text, max);
    const total = cs.reduce((a, c) => a + c.length, 0);
    const dur = t.end - t.start;
    let acc = 0;
    const bounds = [0];
    for (let i = 0; i < cs.length - 1; i++) {
      acc += cs[i].length;
      let b = (acc / total) * dur;
      const near = (t.breaks ?? []).reduce((best, x) => (Math.abs(x - b) < Math.abs(best - b) ? x : best), Infinity);
      if (Math.abs(near - b) < 0.9) b = near;
      bounds.push(b);
    }
    bounds.push(dur);
    const kind = l.phone ? 'phone' : isInner(l) ? 'inner' : 'talk';
    cs.forEach((c, i) => {
      const from = t.start + bounds[i] - 0.05;
      const last = i === cs.length - 1;
      const to = last ? Math.min(t.end + 0.55, next ? next.start - 0.06 : t.end + 0.55) : t.start + bounds[i + 1] - 0.06;
      ev.push({from: Math.round(from * tl.fps), to: Math.round(to * tl.fps), text: tidy(c), kind});
    });
  });
  return ev;
};

export const Subtitles: React.FC<{events: SubEvent[]; hide: [number, number][]}> = ({events, hide}) => {
  const frame = useCurrentFrame();
  const e = events.find((x) => frame >= x.from && frame < x.to);
  if (!e || hide.some(([a, b]) => frame >= a && frame < b)) return null;
  const op = life(frame, e.from, e.to, 3, 3);
  const color = e.kind === 'inner' ? '#FFF3D6' : e.kind === 'phone' ? '#DDF1FF' : '#FFFFFF';
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 58, display: 'flex', justifyContent: 'center', opacity: op}}>
      <div
        style={{
          maxWidth: 1560,
          textAlign: 'center',
          fontFamily: F.maru,
          fontWeight: 700,
          fontSize: 46,
          lineHeight: 1.4,
          letterSpacing: 1,
          color,
          WebkitTextStroke: '7px rgba(10,10,14,0.92)',
          paintOrder: 'stroke fill',
          textShadow: '0 2px 10px rgba(0,0,0,0.55)',
        }}
      >
        {e.kind === 'phone' ? (
          <span
            style={{
              display: 'inline-block',
              fontSize: 26,
              padding: '2px 12px',
              marginRight: 14,
              borderRadius: 8,
              background: 'rgba(120,180,230,0.9)',
              color: '#0d1b2a',
              WebkitTextStroke: '0px',
              verticalAlign: 6,
            }}
          >
            電話
          </span>
        ) : null}
        {e.kind === 'inner' ? `（${e.text}）` : e.text}
      </div>
    </div>
  );
};

// ---- 画面の文字（編集で正確に重ねるもの） ----

/** 時刻・場所（左上） */
export const Caption: React.FC<{from: number; to: number; text: string; sub?: string}> = ({from, to, text, sub}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const op = life(frame, from, to, 10, 12);
  const x = 8 * (1 - ramp(frame, from, from + 14));
  return (
    <div style={{position: 'absolute', left: 72 - x, top: 60, opacity: op, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.7)'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
        <div style={{width: 5, height: 46, background: 'rgba(255,255,255,0.85)', borderRadius: 2}} />
        <div>
          <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 40, letterSpacing: 3}}>{text}</div>
          {sub ? <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 24, opacity: 0.85, marginTop: 2, letterSpacing: 2}}>{sub}</div> : null}
        </div>
      </div>
    </div>
  );
};

export type CardRow = {text: string; size?: number; color?: string; weight?: number; gap?: number; mono?: boolean};

/** 分析・会計のカード。tone: official（公表値・青い枠）／own（自分の観測・白い枠）／ledger（創作実戦ログ・紙） */
export const Card: React.FC<{from: number; to: number; tone: 'official' | 'own' | 'ledger' | 'mixed'; title?: string; rows: CardRow[]; note?: string; x?: number; y?: number; w?: number}> = ({
  from,
  to,
  tone,
  title,
  rows,
  note,
  x = DW / 2,
  y = 440,
  w = 1100,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const op = life(frame, from, to, 10, 10);
  const lift = 18 * (1 - ramp(frame, from, from + 14, Easing.out(Easing.cubic)));
  const paper = tone === 'ledger';
  const border = tone === 'official' ? '4px solid #4FA3FF' : tone === 'own' ? '4px solid #F4F4F4' : tone === 'mixed' ? '4px solid #4FA3FF' : '0px';
  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: y + lift,
        width: w,
        transform: 'translateY(-50%)',
        opacity: op,
        padding: '34px 54px 30px',
        borderRadius: paper ? 6 : 20,
        border,
        background: paper ? 'linear-gradient(180deg, #F6EEDC 0%, #EFE3C8 100%)' : 'rgba(10,18,32,0.86)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
        color: paper ? '#2B2620' : '#FFFFFF',
      }}
    >
      {title ? (
        <div
          style={{
            fontFamily: F.maru,
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: 3,
            color: paper ? '#7A5B2E' : tone === 'own' ? '#D9D9D9' : '#8CC4FF',
            marginBottom: 14,
          }}
        >
          {title}
        </div>
      ) : null}
      {rows.map((r, i) => (
        <div
          key={i}
          style={{
            fontFamily: F.maru,
            fontWeight: r.weight ?? 700,
            fontSize: r.size ?? 46,
            lineHeight: 1.35,
            marginTop: r.gap ?? (i ? 10 : 0),
            color: r.color,
            letterSpacing: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {r.text}
        </div>
      ))}
      {note ? (
        <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 24, marginTop: 20, opacity: 0.78, letterSpacing: 1}}>{note}</div>
      ) : null}
    </div>
  );
};

/** 小さなラベル（台の名前・分析対象など、下の方） */
export const Label: React.FC<{from: number; to: number; rows: CardRow[]; x?: number; y?: number}> = ({from, to, rows, x = 90, y = 700}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const op = life(frame, from, to, 10, 10);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        opacity: op,
        padding: '18px 30px',
        borderLeft: '6px solid #F2B84B',
        background: 'rgba(12,12,16,0.78)',
        color: '#fff',
        borderRadius: '0 12px 12px 0',
      }}
    >
      {rows.map((r, i) => (
        <div key={i} style={{fontFamily: F.maru, fontWeight: r.weight ?? 700, fontSize: r.size ?? 36, marginTop: i ? 6 : 0, color: r.color, letterSpacing: 1}}>
          {r.text}
        </div>
      ))}
    </div>
  );
};

// ---- メモ（ベージュの上綴じリングメモ。手書き風の文字を編集で正確に書く） ----

export type MemoRow = {
  text: string;
  row: number; // 行（0 から。行の高さは 64px）
  at?: number; // 書き始め（このメモが出てからの秒。省略は最初から書いてある）
  dur?: number; // 書く時間（秒）
  size?: number;
  indent?: number;
  strike?: {word: string; at: number}; // word を二重線で消す
  erase?: number; // 消しゴムで消す（秒）
  underline?: number; // 下線を引く（秒）
  color?: string;
};

export const Memo: React.FC<{from: number; to: number; rows: MemoRow[]; cols?: {row: number; heads: string[]; at?: number}; fps: number; title?: string; own?: boolean}> = ({
  from,
  to,
  rows,
  cols,
  fps,
  title,
  own,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const op = life(frame, from, to, 8, 8);
  const t = (frame - from) / fps;
  const W0 = 1040;
  const H0 = 700;
  const lineY = (r: number) => 118 + r * 64;
  return (
    <div
      style={{
        position: 'absolute',
        left: DW / 2 - W0 / 2,
        top: 70 + 10 * (1 - ramp(frame, from, from + 12)),
        width: W0,
        height: H0,
        opacity: op,
        transform: 'rotate(-1.2deg)',
        borderRadius: 10,
        background:
          'repeating-linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 63px, rgba(120,150,190,0.28) 63px, rgba(120,150,190,0.28) 65px), linear-gradient(180deg, #F5ECD8 0%, #EEE2C6 100%)',
        backgroundPosition: '0 89px, 0 0',
        boxShadow: '0 22px 60px rgba(0,0,0,0.5)',
        outline: own ? '6px solid rgba(255,255,255,0.95)' : undefined,
        outlineOffset: own ? 10 : undefined,
      }}
    >
      {/* 上綴じのリング */}
      {Array.from({length: 17}).map((_, i) => (
        <div key={i} style={{position: 'absolute', top: -16, left: 44 + i * 58, width: 16, height: 40, borderRadius: 8, border: '4px solid #3a3a3e', background: 'rgba(0,0,0,0)'}} />
      ))}
      {title ? (
        <div style={{position: 'absolute', right: 40, top: 30, fontFamily: F.hand, fontSize: 26, color: '#6b6258'}}>{title}</div>
      ) : null}
      {cols ? (
        <div style={{position: 'absolute', left: 50, right: 50, top: lineY(cols.row) - 50, height: H0 - lineY(cols.row) + 10, display: 'flex', opacity: cols.at === undefined ? 1 : clamp01((t - cols.at) / 0.6)}}>
          {cols.heads.map((h, i) => (
            <div key={i} style={{flex: i === 2 ? 1.6 : 1, borderLeft: i ? '3px solid rgba(60,52,44,0.75)' : 'none', paddingLeft: 16, fontFamily: F.hand, fontSize: 36, color: '#2D2A26'}}>
              {h}
            </div>
          ))}
        </div>
      ) : null}
      {rows.map((r, i) => {
        if (r.erase !== undefined && t > r.erase + 0.5) return null;
        const start = r.at ?? -100;
        const d = r.dur ?? Math.max(0.6, r.text.length * 0.11);
        const shown = Math.floor(r.text.length * clamp01((t - start) / d));
        if (shown <= 0) return null;
        const eraseOp = r.erase !== undefined ? 1 - clamp01((t - r.erase) / 0.5) : 1;
        const sIdx = r.strike ? r.text.indexOf(r.strike.word) : -1;
        const sp = r.strike ? clamp01((t - r.strike.at) / 0.5) : 0;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 60 + (r.indent ?? 0),
              top: lineY(r.row) - (r.size ?? 44) - 6,
              fontFamily: F.hand,
              fontSize: r.size ?? 44,
              color: r.color ?? '#2D2A26',
              whiteSpace: 'pre',
              opacity: eraseOp,
            }}
          >
            {sIdx >= 0 ? (
              <>
                {r.text.slice(0, sIdx).slice(0, shown)}
                <span style={{position: 'relative'}}>
                  {r.text.slice(sIdx, sIdx + r.strike!.word.length).slice(0, Math.max(0, shown - sIdx))}
                  {sp > 0 ? (
                    <>
                      <span style={{position: 'absolute', left: 0, top: '44%', height: 3, width: `${sp * 100}%`, background: '#2D2A26'}} />
                      <span style={{position: 'absolute', left: 0, top: '60%', height: 3, width: `${sp * 100}%`, background: '#2D2A26'}} />
                    </>
                  ) : null}
                </span>
                {r.text.slice(sIdx + r.strike!.word.length).slice(0, Math.max(0, shown - sIdx - r.strike!.word.length))}
              </>
            ) : (
              r.text.slice(0, shown)
            )}
            {r.underline !== undefined && t > r.underline ? (
              <span style={{position: 'absolute', left: 0, bottom: -4, height: 3, width: `${clamp01((t - r.underline) / 0.5) * 100}%`, background: '#2D2A26'}} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

// ---- スマホ（編集のカード。スマホの画面に文字を貼る表現にはしない） ----

const AppIcon: React.FC<{color?: string}> = ({color = '#4CAF7A'}) => (
  <div style={{width: 46, height: 46, borderRadius: 12, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
    <div style={{width: 24, height: 18, borderRadius: 9, background: '#fff'}} />
  </div>
);

/** 通知（上から下りてくる。dismiss で左へ払って消す） */
export const Notice: React.FC<{from: number; to: number; app: string; sender: string; lines: string[]; time?: string; dismiss?: number; x?: number; y?: number; icon?: string}> = ({
  from,
  to,
  app,
  sender,
  lines,
  time,
  dismiss,
  x = DW - 760,
  y = 70,
  icon,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const inP = ramp(frame, from, from + 12, Easing.out(Easing.cubic));
  const outP = dismiss !== undefined ? ramp(frame, dismiss, dismiss + 10, Easing.in(Easing.cubic)) : 0;
  const op = Math.min(inP, 1 - ramp(frame, to - 8, to)) * (1 - outP);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - outP * 500,
        top: y - 40 * (1 - inP),
        width: 680,
        opacity: op,
        padding: '22px 26px',
        borderRadius: 26,
        background: 'rgba(245,245,247,0.94)',
        boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
        color: '#1c1c1e',
        fontFamily: F.maru,
      }}
    >
      <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
        <AppIcon color={icon} />
        <div style={{fontWeight: 700, fontSize: 24, color: '#6b6b70', flex: 1}}>{app}</div>
        {time ? <div style={{fontWeight: 700, fontSize: 24, color: '#6b6b70'}}>{time}</div> : null}
      </div>
      <div style={{fontWeight: 900, fontSize: 34, marginTop: 12}}>{sender}</div>
      {lines.map((l, i) => (
        <div key={i} style={{fontWeight: 700, fontSize: 32, marginTop: 6, lineHeight: 1.35}}>
          {l}
        </div>
      ))}
    </div>
  );
};

export type Bubble = {text: string; me?: boolean};

/** やりとりの画面（受け取った文と、入力欄。typed は入力中の文字、typeFrom〜typeTo で打ち、delFrom〜delTo で消す） */
export const Chat: React.FC<{
  from: number;
  to: number;
  name: string;
  bubbles: Bubble[];
  typed?: string;
  typeFrom?: number;
  typeTo?: number;
  delFrom?: number;
  delTo?: number;
  sentAt?: number; // 入力した文を送ったフレーム（送ったら吹き出しになる）
  x?: number;
}> = ({from, to, name, bubbles, typed = '', typeFrom = 0, typeTo = 0, delFrom, delTo, sentAt, x = DW - 640}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const op = life(frame, from, to, 10, 10);
  const slide = 30 * (1 - ramp(frame, from, from + 14, Easing.out(Easing.cubic)));
  let n = typeTo > typeFrom ? Math.floor(typed.length * clamp01((frame - typeFrom) / (typeTo - typeFrom))) : typed.length;
  if (delFrom !== undefined && delTo !== undefined) n = Math.floor(n * (1 - clamp01((frame - delFrom) / Math.max(1, delTo - delFrom))));
  const sent = sentAt !== undefined && frame >= sentAt;
  const all = sent ? [...bubbles, {text: typed, me: true}] : bubbles;
  const caret = !sent && Math.floor(frame / 12) % 2 === 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: x + slide,
        top: 70,
        width: 560,
        height: 780,
        opacity: op,
        borderRadius: 34,
        background: '#EDEFF2',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        fontFamily: F.maru,
      }}
    >
      <div style={{height: 96, background: '#2E3440', color: '#fff', display: 'flex', alignItems: 'center', padding: '0 30px', fontWeight: 900, fontSize: 34}}>{name}</div>
      <div style={{position: 'absolute', top: 120, left: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 16}}>
        {all.map((b, i) => (
          <div key={i} style={{alignSelf: b.me ? 'flex-end' : 'flex-start', maxWidth: 430}}>
            <div
              style={{
                padding: '14px 20px',
                borderRadius: 22,
                background: b.me ? '#9FE08A' : '#FFFFFF',
                color: '#1c1c1e',
                fontWeight: 700,
                fontSize: 31,
                lineHeight: 1.4,
                boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
              }}
            >
              {b.text}
            </div>
          </div>
        ))}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 110, background: '#FFFFFF', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 16}}>
        <div style={{flex: 1, height: 66, borderRadius: 33, background: '#F1F2F5', display: 'flex', alignItems: 'center', padding: '0 24px', fontWeight: 700, fontSize: 31, color: '#1c1c1e'}}>
          {sent ? '' : typed.slice(0, n)}
          {caret ? <span style={{display: 'inline-block', width: 3, height: 36, background: '#3B82F6', marginLeft: 2}} /> : null}
        </div>
        <div style={{width: 66, height: 66, borderRadius: 33, background: n > 0 && !sent ? '#3B82F6' : '#C9CDD4', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{width: 0, height: 0, borderTop: '12px solid transparent', borderBottom: '12px solid transparent', borderLeft: '20px solid #fff', marginLeft: 6}} />
        </div>
      </div>
    </div>
  );
};

/** 予定の画面（カレンダーの1件） */
export const Schedule: React.FC<{from: number; to: number; title: string; when: string; x?: number; y?: number}> = ({from, to, title, when, x = DW - 700, y = 120}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const op = life(frame, from, to, 10, 10);
  return (
    <div style={{position: 'absolute', left: x, top: y, width: 600, opacity: op, borderRadius: 26, background: 'rgba(245,245,247,0.95)', boxShadow: '0 16px 40px rgba(0,0,0,0.45)', overflow: 'hidden', fontFamily: F.maru}}>
      <div style={{background: '#D9534F', color: '#fff', fontWeight: 900, fontSize: 26, padding: '12px 26px', letterSpacing: 2}}>予定</div>
      <div style={{padding: '22px 26px', color: '#1c1c1e'}}>
        <div style={{fontWeight: 700, fontSize: 28, color: '#6b6b70'}}>{title}</div>
        <div style={{fontWeight: 900, fontSize: 52, marginTop: 6, letterSpacing: 2}}>{when}</div>
      </div>
    </div>
  );
};

// ---- 題字・終わり ----

export const Title: React.FC<{from: number; to: number; series: string; episode: string; disclaimer: string}> = ({from, to, series, episode, disclaimer}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const op = life(frame, from, to, 16, 16);
  const op2 = life(frame, from + 10, to, 16, 16);
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.35) 100%)', opacity: op}} />
      <div style={{textAlign: 'center', color: '#fff', textShadow: '0 0 3px rgba(0,0,0,0.9), 0 4px 28px rgba(0,0,0,0.85)', marginTop: -60}}>
        <div style={{fontFamily: F.mincho, fontSize: 96, letterSpacing: 14, opacity: op}}>{series}</div>
        <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 44, letterSpacing: 6, marginTop: 26, opacity: op2}}>{episode}</div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 52,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: F.maru,
          fontWeight: 700,
          fontSize: 27,
          color: 'rgba(255,255,255,0.92)',
          letterSpacing: 1,
          textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          opacity: op2,
        }}
      >
        {disclaimer}
      </div>
    </AbsoluteFill>
  );
};

export const EndCard: React.FC<{from: number; text: string}> = ({from, text}) => {
  const frame = useCurrentFrame();
  if (frame < from) return null;
  const op = ramp(frame, from, from + 30, Easing.linear);
  return (
    <AbsoluteFill style={{background: `rgba(4,5,8,${op})`, alignItems: 'center', justifyContent: 'center'}}>
      <div style={{fontFamily: F.mincho, fontSize: 64, letterSpacing: 10, color: '#EDE6D6', opacity: ramp(frame, from + 18, from + 48, Easing.linear)}}>{text}</div>
    </AbsoluteFill>
  );
};

/** 場面の間の暗転（at の前後 out/inn フレームで黒くなって戻る） */
export const Blackouts: React.FC<{cuts: {at: number; out: number; inn: number}[]}> = ({cuts}) => {
  const frame = useCurrentFrame();
  let op = 0;
  for (const c of cuts) {
    if (frame >= c.at - c.out && frame < c.at) op = Math.max(op, ramp(frame, c.at - c.out, c.at, Easing.linear));
    if (frame >= c.at && frame < c.at + c.inn) op = Math.max(op, 1 - ramp(frame, c.at, c.at + c.inn, Easing.linear));
  }
  return op > 0 ? <AbsoluteFill style={{background: '#000', opacity: op}} /> : null;
};

/** 小さな表示（右上）：この版が静止画で作った制作版であること */
export const Badge: React.FC<{text: string}> = ({text}) => (
  <div style={{position: 'absolute', right: 36, top: 26, fontFamily: F.maru, fontWeight: 700, fontSize: 20, color: 'rgba(255,255,255,0.55)', letterSpacing: 1, textShadow: '0 1px 4px rgba(0,0,0,0.7)'}}>{text}</div>
);
