import React from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame } from "remotion";
import { CLAMP, enter, flash, shake, slam } from "../anim";
import { GoalCount, GradientText, RankBadge, Reveal, StatChips } from "../components/Parts";
import { CUES, FRAMES_PER_BEAT } from "../schedule.mjs";
import type { RankedPlayer } from "../schedule.mjs";
import { C, GOLD_TEXT, JP, NUM, SAFE } from "../theme";

const SPARKS = new Array(46).fill(0).map((_, i) => ({
  x: random(`x${i}`) * 1080,
  size: 6 + random(`s${i}`) * 16,
  speed: 5 + random(`v${i}`) * 9,
  delay: random(`d${i}`) * 50,
  sway: 20 + random(`w${i}`) * 50,
}));

const Crown: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size * 0.7} viewBox="0 0 100 70">
    <defs>
      <linearGradient id="crown" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFF6C2" />
        <stop offset="0.5" stopColor="#FFC93C" />
        <stop offset="1" stopColor="#F08A00" />
      </linearGradient>
    </defs>
    <path d="M6 62 L0 14 L26 36 L50 2 L74 36 L100 14 L94 62 Z" fill="url(#crown)" />
    <rect x="6" y="60" width="88" height="10" rx="3" fill="url(#crown)" />
  </svg>
);

/** 1位の発表。最初の1小節は溜めて、太鼓の終わりでドンと出す */
export const RankTop: React.FC<{ player: RankedPlayer; gapToSecond: number }> = ({
  player,
  gapToSecond,
}) => {
  const frame = useCurrentFrame();
  const cue = CUES.top;
  const f = frame - cue.reveal; // 発表の瞬間を 0 とした時間
  const revealed = f >= 0;
  const hit = shake(frame, cue.reveal, 34, 16);
  const calloutHit = shake(frame, cue.callout, 12, 8);

  // 溜めの文字は拍ごとに脈打つ
  const beat = (frame % FRAMES_PER_BEAT) / FRAMES_PER_BEAT;
  const tease = enter(frame, 4, 10);
  const callout = enter(frame, cue.callout, 4);

  return (
    <AbsoluteFill style={{ translate: `${hit.x + calloutHit.x}px ${hit.y + calloutHit.y}px` }}>
      {!revealed ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              marginTop: -180,
              fontFamily: JP,
              fontWeight: 900,
              fontSize: 190,
              lineHeight: 1.1,
              color: C.white,
              opacity: tease,
              scale: interpolate(beat, [0, 0.2, 1], [1.07, 1, 1], CLAMP) * (0.9 + 0.1 * tease),
              textShadow: "0 0 60px rgba(255,201,60,0.7)",
            }}
          >
            第<span style={{ color: C.gold }}>1</span>位は…
          </div>
          <div
            style={{
              marginTop: 40,
              fontFamily: JP,
              fontWeight: 900,
              fontSize: 64,
              lineHeight: 1,
              color: C.gold,
              opacity: enter(frame, 20, 10),
              letterSpacing: 6,
            }}
          >
            不滅の大記録
          </div>
        </AbsoluteFill>
      ) : (
        <>
          {/* 後光 */}
          <AbsoluteFill
            style={{
              background: `repeating-conic-gradient(from ${f * 0.6}deg at 50% 34%, rgba(255,201,60,0.2) 0deg 7deg, transparent 7deg 20deg)`,
              WebkitMaskImage: "radial-gradient(900px 900px at 50% 34%, #000 0%, transparent 72%)",
              maskImage: "radial-gradient(900px 900px at 50% 34%, #000 0%, transparent 72%)",
              opacity: enter(frame, cue.reveal, 16),
            }}
          />
          {/* 舞い上がる金の粒 */}
          {SPARKS.map((s, i) => {
            const t = f - s.delay * 0.4;
            if (t < 0) return null;
            const y = 1980 - t * s.speed * 1.6;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: s.x + Math.sin(t / 14 + i) * s.sway,
                  top: y,
                  width: s.size,
                  height: s.size,
                  borderRadius: i % 3 === 0 ? 2 : "50%",
                  backgroundColor: i % 4 === 0 ? "#FFF6C2" : C.gold,
                  opacity: interpolate(y, [300, 900, 1900], [0, 0.75, 0.9], CLAMP),
                  rotate: `${t * 6}deg`,
                }}
              />
            );
          })}

          <div
            style={{
              position: "absolute",
              left: SAFE.left + 26,
              top: 318,
              opacity: enter(frame, cue.reveal + 6, 6),
              translate: `0px ${(1 - enter(frame, cue.reveal + 6, 12)) * -80}px`,
              rotate: "-8deg",
            }}
          >
            <Crown size={150} />
          </div>
          <div style={{ position: "absolute", left: SAFE.left, top: 410 }}>
            <RankBadge rank={player.rank} frame={f} size={390} />
          </div>

          <Reveal frame={frame} start={cue.name} style={{ position: "absolute", left: SAFE.left, top: 762 }}>
            <div
              style={{
                fontFamily: JP,
                fontWeight: 900,
                fontSize: 184,
                lineHeight: 1.08,
                color: C.white,
                whiteSpace: "nowrap",
                textShadow: "0 0 50px rgba(255,201,60,0.55), 0 10px 30px rgba(0,0,0,0.45)",
              }}
            >
              {player.name}
            </div>
          </Reveal>

          <div
            style={{
              position: "absolute",
              left: SAFE.left + 6,
              top: 998,
              display: "flex",
              alignItems: "center",
              opacity: enter(frame, cue.name + 6, 12),
            }}
          >
            <div style={{ width: 64, height: 8, backgroundColor: C.gold, marginRight: 20 }} />
            <span
              style={{
                fontFamily: NUM,
                fontWeight: 700,
                fontSize: 56,
                lineHeight: 1,
                letterSpacing: 5,
                color: C.gold,
                whiteSpace: "nowrap",
              }}
            >
              {player.roman}
            </span>
          </div>

          <div style={{ position: "absolute", left: SAFE.left, top: 1078 }}>
            <GoalCount
              goals={player.goals}
              frame={frame}
              start={cue.countStart}
              end={cue.countEnd}
              size={350}
            />
          </div>

          <div style={{ position: "absolute", left: SAFE.left, top: 1378, width: SAFE.right - SAFE.left }}>
            <StatChips player={player} frame={frame} start={cue.chips} scale={1.15} />
          </div>

          {/* 2位との差をスタンプで押す */}
          <div
            style={{
              position: "absolute",
              left: 520,
              top: 452,
              opacity: callout,
              scale: slam(frame, cue.callout, 2.6),
              rotate: "-7deg",
              backgroundColor: C.red,
              padding: "20px 34px 24px",
              borderRadius: 14,
              boxShadow: "0 14px 34px rgba(0,0,0,0.45)",
              border: "5px solid #fff",
            }}
          >
            <div style={{ fontFamily: JP, fontWeight: 900, fontSize: 46, lineHeight: 1, color: C.white }}>
              2位に
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                marginTop: 6,
                color: C.white,
                whiteSpace: "nowrap",
              }}
            >
              <GradientText
                gradient={GOLD_TEXT}
                style={{ fontFamily: NUM, fontWeight: 900, fontStyle: "italic", fontSize: 150, lineHeight: 0.9 }}
              >
                {gapToSecond}
              </GradientText>
              <span style={{ fontFamily: JP, fontWeight: 900, fontSize: 62, lineHeight: 1, marginLeft: 10 }}>
                ゴール差
              </span>
            </div>
          </div>
        </>
      )}

      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash(frame, cue.reveal, 1, 14) }} />
    </AbsoluteFill>
  );
};
