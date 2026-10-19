// ランキング（TOP10）の部品：順位、夫の失言カード、しのぶのツッコミ、記録回数のはんこ、残りの順位の帯、チャット画面、まとめのノート。
import React from 'react';
import {Easing, useCurrentFrame} from 'remotion';
import {F} from './fonts';
import {C, Outlined} from './parts';
import {W, clamp01, life, pop, wobble} from './lib';

/** 順位ごとの色（4位以下は夫の紺、3〜1位は銅・銀・金） */
export const tier = (rank: number) =>
  rank === 1
    ? {fill: '#F0A91B', shadow: 'rgba(120,70,0,0.45)'}
    : rank === 2
      ? {fill: '#8E9BB0', shadow: 'rgba(40,50,70,0.4)'}
      : rank === 3
        ? {fill: '#C0743E', shadow: 'rgba(90,40,10,0.4)'}
        : {fill: C.navy, shadow: 'rgba(20,30,60,0.35)'};

const fit = (lines: string[], width: number, max: number) => Math.min(max, Math.floor(width / Math.max(...lines.map((l) => [...l].length), 1)));

// ───────── 「第10位」：区切りの頭でドンと出る ─────────
export const RankBadge: React.FC<{rank: number; x: number; y: number; from: number; to: number}> = ({rank, x, y, from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 12, 230);
  const t = tier(rank);
  const sh = `drop-shadow(0 8px 0 ${t.shadow})`;
  const part = (text: string, size: number, stroke: number) => (
    <Outlined size={size} color={t.fill} font={F.dela} weight={400} stroke={stroke} shadow={sh}>
      {text}
    </Outlined>
  );
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        display: 'flex',
        alignItems: 'baseline',
        opacity: clamp01(p * 3),
        transform: `translate(-50%, -50%) scale(${1.7 - 0.7 * p}) rotate(${(1 - p) * -8}deg)`,
      }}
    >
      {part('第', 88, 18)}
      {part(String(rank), rank >= 10 ? 176 : 196, 24)}
      {part('位', 88, 18)}
    </div>
  );
};

// ───────── 夫の失言（白いカード・紺の文字。| で改行） ─────────
export const QuoteCard: React.FC<{text: string; note?: string; who?: string; cy: number; from: number; to: number; max?: number}> = ({
  text,
  note,
  who = '夫・まもる',
  cy,
  from,
  to,
  max = 84,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const lines = text.split('|');
  lines[0] = '「' + lines[0];
  lines[lines.length - 1] += '」';
  const fs = fit(lines, 790, max);
  const p = pop(frame, from, 11, 210);
  return (
    <div style={{position: 'absolute', left: 0, width: W, top: cy, display: 'flex', justifyContent: 'center', opacity: life(frame, from, to, 2, 3)}}>
      <div
        style={{
          position: 'relative',
          transform: `translate(-20px, -50%) scale(${0.6 + 0.4 * p})`,
          background: '#fff',
          borderRadius: 32,
          padding: '34px 44px 30px',
          maxWidth: 900,
          boxShadow: '0 10px 0 rgba(30,40,80,0.22), 0 18px 30px rgba(20,20,40,0.25)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: 30,
            background: C.navy,
            color: '#fff',
            fontFamily: F.maru,
            fontWeight: 900,
            fontSize: 34,
            padding: '4px 22px 6px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
          }}
        >
          {who}
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{fontFamily: F.maru, fontWeight: 900, fontSize: fs, lineHeight: 1.3, color: C.navy, whiteSpace: 'pre'}}>
            {l}
          </div>
        ))}
        {note && <div style={{fontFamily: F.maru, fontWeight: 700, fontSize: 38, color: '#8a7f78', marginTop: 2}}>{note}</div>}
      </div>
    </div>
  );
};

// ───────── しのぶのツッコミ（暗い手書きのカード。右から入る） ─────────
export const Tsukkomi: React.FC<{text: string; cy: number; from: number; to: number}> = ({text, cy, from, to}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const lines = text.split('|');
  const fs = fit(lines, 760, 64);
  const p = pop(frame, from, 12, 200);
  return (
    <div style={{position: 'absolute', left: 0, width: W, top: cy, display: 'flex', justifyContent: 'center', opacity: life(frame, from, to, 2, 3)}}>
      <div
        style={{
          position: 'relative',
          transform: `translate(${-20 + (1 - p) * 140}px, -50%)`,
          background: 'rgba(38,32,46,0.92)',
          borderRadius: 28,
          padding: '30px 44px 26px',
          border: '3px dashed rgba(255,255,255,0.32)',
          boxShadow: '0 10px 26px rgba(20,10,30,0.35)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -28,
            left: 28,
            background: '#E8A33A',
            color: '#fff',
            fontFamily: F.maru,
            fontWeight: 900,
            fontSize: 32,
            padding: '3px 20px 5px',
            borderRadius: 999,
            whiteSpace: 'nowrap',
          }}
        >
          しのぶ
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{fontFamily: F.hand, fontSize: fs, lineHeight: 1.35, color: '#fff', whiteSpace: 'pre'}}>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
};

// ───────── 記録回数のはんこ。rollTo があれば 0 から数え上げて、最後にドン ─────────
export const CountStamp: React.FC<{x: number; y: number; count: number; from: number; to: number; rollTo?: number}> = ({x, y, count, from, to, rollTo}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const roll = rollTo !== undefined;
  const n = roll ? Math.round(count * Easing.out(Easing.cubic)(clamp01((frame - from) / (rollTo - from)))) : count;
  const sp = pop(frame, roll ? rollTo : from, 13, 260);
  const scale = roll ? (frame < rollTo ? 0.6 + 0.4 * pop(frame, from, 12, 220) : 1 + 0.4 * (1 - sp)) : 2.1 - 1.1 * sp;
  const shake = roll && frame < rollTo ? wobble(frame, 4, 3) : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: x + shake,
        top: y,
        opacity: roll ? 1 : clamp01(sp * 2.5),
        transform: `translate(-50%, -50%) rotate(-8deg) scale(${scale})`,
        border: `8px solid ${C.red}`,
        borderRadius: 18,
        background: 'rgba(255,255,255,0.93)',
        padding: '4px 22px 8px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxShadow: '0 8px 18px rgba(60,20,20,0.25)',
        color: C.red,
        fontFamily: F.dela,
        lineHeight: 1.05,
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{fontSize: 36, letterSpacing: 8}}>記録</div>
      <div style={{display: 'flex', alignItems: 'baseline', fontVariantNumeric: 'tabular-nums'}}>
        <span style={{fontSize: n >= 1000 ? 78 : 92}}>{n.toLocaleString('en-US')}</span>
        <span style={{fontSize: 46}}>回</span>
      </div>
    </div>
  );
};

// ───────── 残りの順位（10〜1 の帯）。cur：いまの順位（11 は始まる前、0 は全部済み） ─────────
export const RankStrip: React.FC<{cur: number; since: number; top?: number}> = ({cur, since, top = 214}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{position: 'absolute', top, left: 0, width: W, display: 'flex', justifyContent: 'center', gap: 8}}>
      {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => {
        const done = r > cur;
        const now = r === cur;
        return (
          <div
            key={r}
            style={{
              width: 50,
              height: 40,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: F.dela,
              fontSize: 24,
              color: done || now ? '#fff' : '#9a8f88',
              background: now ? C.coral : done ? '#e9a8b5' : '#fff',
              border: '3px solid #fff',
              boxShadow: now ? '0 0 0 4px rgba(232,103,127,0.35), 0 4px 0 rgba(60,40,30,0.15)' : '0 4px 0 rgba(60,40,30,0.12)',
              transform: `scale(${now ? 0.9 + 0.22 * pop(frame, since) : 1})`,
            }}
          >
            {r}
          </div>
        );
      })}
    </div>
  );
};

// ───────── チャット画面（しのぶの長文に、夫の返事）。特定のアプリの見た目には似せない ─────────
export const ChatScreen: React.FC<{name: string; mine: string; reply: string; cx: number; cy: number; from: number; to: number; replyAt: number}> = ({
  name,
  mine,
  reply,
  cx,
  cy,
  from,
  to,
  replyAt,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const w = 760;
  const h = 680;
  const p = pop(frame, from, 13, 190);
  const rp = pop(frame, replyAt, 10, 230);
  const small: React.CSSProperties = {fontFamily: F.maru, fontWeight: 700, fontSize: 24, color: '#8d8478', lineHeight: 1.3, whiteSpace: 'nowrap'};
  return (
    <div
      style={{
        position: 'absolute',
        left: cx - w / 2,
        top: cy - h / 2,
        width: w,
        height: h,
        borderRadius: 46,
        background: '#1f1c24',
        padding: 14,
        boxSizing: 'border-box',
        boxShadow: '0 20px 40px rgba(10,5,20,0.45)',
        opacity: life(frame, from, to, 2, 3),
        transform: `translateY(${(1 - p) * 80}px) scale(${0.85 + 0.15 * p})`,
      }}
    >
      <div style={{width: '100%', height: '100%', borderRadius: 34, overflow: 'hidden', background: '#EFE7DA', display: 'flex', flexDirection: 'column'}}>
        <div style={{height: 92, background: '#fff', display: 'flex', alignItems: 'center', padding: '0 30px', gap: 18, fontFamily: F.maru, fontWeight: 900, fontSize: 40, color: C.ink}}>
          <span style={{fontSize: 40, color: '#b8ada0'}}>＜</span>
          {name}
        </div>
        <div style={{flex: 1, padding: '30px 30px', display: 'flex', flexDirection: 'column', gap: 30}}>
          <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 12}}>
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'flex-end'}}>
              <span style={small}>既読</span>
              <span style={small}>18:02</span>
            </div>
            <div
              style={{
                maxWidth: 520,
                background: '#FBD97A',
                borderRadius: '28px 8px 28px 28px',
                padding: '18px 24px 20px',
                fontFamily: F.maru,
                fontWeight: 700,
                fontSize: 33,
                lineHeight: 1.45,
                color: C.ink,
              }}
            >
              {mine}
            </div>
          </div>
          {frame >= replyAt && (
            <div style={{display: 'flex', alignItems: 'flex-end', gap: 14, transform: `scale(${0.4 + 0.6 * rp})`, transformOrigin: '0 100%'}}>
              <div
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: 35,
                  background: C.navy,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: F.dela,
                  fontSize: 34,
                  flex: 'none',
                }}
              >
                ま
              </div>
              <div style={{background: '#fff', borderRadius: '8px 28px 28px 28px', padding: '6px 34px 10px', fontFamily: F.maru, fontWeight: 900, fontSize: 92, color: C.navy, lineHeight: 1.2}}>
                {reply}
              </div>
              <span style={small}>18:47</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ───────── まとめ：失言ノートのページに TOP10 を書き出す（下の10位から順に） ─────────
export type NoteRow = {rank: number; quote: string; count: number};
export const NotePage: React.FC<{x: number; top: number; w: number; title: string; rows: NoteRow[]; rowAt: (rank: number) => number; from: number; to: number}> = ({
  x,
  top,
  w,
  title,
  rows,
  rowAt,
  from,
  to,
}) => {
  const frame = useCurrentFrame();
  if (frame < from || frame >= to) return null;
  const p = pop(frame, from, 13, 190);
  const quoteW = w - 60 - 96 - 190 - 40;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - w / 2,
        top,
        width: w,
        boxSizing: 'border-box',
        padding: '28px 30px 24px 30px',
        borderRadius: 18,
        background: '#FFFDF6',
        backgroundImage: 'repeating-linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 67px, rgba(70,110,170,0.18) 67px, rgba(70,110,170,0.18) 69px)',
        backgroundPosition: '0 104px',
        boxShadow: '0 18px 40px rgba(20,10,30,0.4)',
        opacity: life(frame, from, to, 3, 4),
        transform: `translateY(${(1 - p) * 120}px) rotate(${-1.5 + (1 - p) * -4}deg)`,
      }}
    >
      <div style={{position: 'absolute', left: 120, top: 0, bottom: 0, width: 3, background: 'rgba(201,74,91,0.45)'}} />
      <div style={{display: 'flex', alignItems: 'baseline', gap: 14, height: 76, paddingLeft: 6}}>
        <span style={{fontFamily: F.mincho, fontWeight: 700, fontSize: 52, color: '#22201f'}}>{title}</span>
        <span style={{fontFamily: F.maru, fontWeight: 700, fontSize: 30, color: '#8a7f78'}}>（記録回数）</span>
      </div>
      {rows.map((r) => {
        const at = rowAt(r.rank);
        const rp = pop(frame, at, 12, 230);
        const t = tier(r.rank);
        const q = `「${r.quote.replace(/\|/g, '')}」`;
        const fs = Math.min(40, Math.floor(quoteW / [...q].length));
        return (
          <div key={r.rank} style={{height: 68, display: 'flex', alignItems: 'center', gap: 20, opacity: frame >= at ? clamp01(rp * 2) : 0, transform: `translateX(${(1 - rp) * 40}px)`}}>
            <div style={{width: 96, textAlign: 'right', fontFamily: F.dela, fontSize: r.rank <= 3 ? 44 : 38, color: t.fill, whiteSpace: 'nowrap'}}>{r.rank}位</div>
            <div style={{width: quoteW, fontFamily: F.maru, fontWeight: 900, fontSize: fs, color: C.navy, whiteSpace: 'nowrap', overflow: 'hidden'}}>{q}</div>
            <div style={{width: 190, textAlign: 'right', fontFamily: F.dela, fontSize: 38, color: C.red, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums'}}>
              {r.count.toLocaleString('en-US')}回
            </div>
          </div>
        );
      })}
    </div>
  );
};
