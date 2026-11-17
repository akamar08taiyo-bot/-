import React from "react";
import { bump, countUp, enter, slam } from "../anim";
import { C, GOLD_TEXT, JP, NUM, accentFor, gradientFor } from "../theme";
import type { RankedPlayer } from "../schedule.mjs";

/** グラデーションで塗った文字（斜体が欠けないよう左右に余白を持たせる） */
export const GradientText: React.FC<{
  gradient: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ gradient, style, children }) => (
  <span
    style={{
      display: "inline-block",
      backgroundImage: gradient,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      padding: "0.06em 0.16em 0.06em 0.06em",
      margin: "-0.06em -0.16em -0.06em -0.06em",
      ...style,
    }}
  >
    {children}
  </span>
);

/** 「10位」の大きな順位表示。ドンと落ちてくる */
export const RankBadge: React.FC<{
  rank: number;
  frame: number;
  size: number;
  tied?: boolean;
}> = ({ rank, frame, size, tied }) => (
  <div
    style={{
      display: "flex",
      alignItems: "baseline",
      transformOrigin: "20% 60%",
      scale: slam(frame, 0),
      opacity: enter(frame, 0, 4),
      filter: `drop-shadow(0 ${size * 0.03}px ${size * 0.06}px rgba(0,0,0,0.45))`,
    }}
  >
    <GradientText
      gradient={gradientFor(rank)}
      style={{
        fontFamily: NUM,
        fontWeight: 900,
        fontStyle: "italic",
        fontSize: size,
        lineHeight: 0.86,
        letterSpacing: -size * 0.02,
      }}
    >
      {rank}
    </GradientText>
    <span
      style={{
        fontFamily: JP,
        fontWeight: 900,
        fontSize: size * 0.36,
        lineHeight: 1,
        color: C.white,
        marginLeft: size * 0.06,
      }}
    >
      位
    </span>
    {tied ? (
      <span
        style={{
          fontFamily: JP,
          fontWeight: 900,
          fontSize: size * 0.22,
          lineHeight: 1,
          color: C.white,
          backgroundColor: C.red,
          padding: `${size * 0.05}px ${size * 0.09}px`,
          borderRadius: size * 0.04,
          marginLeft: size * 0.08,
          alignSelf: "center",
          scale: slam(frame, 8, 1.8),
          opacity: enter(frame, 8, 4),
        }}
      >
        タイ
      </span>
    ) : null}
  </div>
);

/** 下からせり上がって出てくる1行 */
export const Reveal: React.FC<{
  frame: number;
  start: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ frame, start, children, style }) => (
  <div style={{ overflow: "hidden", padding: "0.12em 0.3em 0.12em 0", ...style }}>
    <div style={{ translate: `0px ${(1 - enter(frame, start, 14)) * 105}%` }}>{children}</div>
  </div>
);

/** カウントアップする得点数 ＋「ゴール」 */
export const GoalCount: React.FC<{
  goals: number;
  frame: number;
  start: number;
  end: number;
  size: number;
  labelSize?: number;
  column?: boolean;
}> = ({ goals, frame, start, end, size, labelSize = size * 0.3, column }) => (
  <div
    style={{
      display: "flex",
      flexDirection: column ? "column" : "row",
      alignItems: column ? "flex-end" : "baseline",
      opacity: enter(frame, start, 5),
      scale: bump(frame, end),
      transformOrigin: column ? "100% 50%" : "0% 80%",
    }}
  >
    <GradientText
      gradient={GOLD_TEXT}
      style={{
        fontFamily: NUM,
        fontWeight: 900,
        fontStyle: "italic",
        fontSize: size,
        lineHeight: 0.86,
        filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.4))",
      }}
    >
      {countUp(frame, start, end, goals)}
    </GradientText>
    <span
      style={{
        fontFamily: JP,
        fontWeight: 900,
        fontSize: labelSize,
        lineHeight: 1,
        color: C.white,
        marginLeft: column ? 0 : size * 0.08,
        marginTop: column ? size * 0.04 : 0,
      }}
    >
      ゴール
    </span>
  </div>
);

export const perGame = (p: RankedPlayer) => (p.goals / p.caps).toFixed(2);

/** 出場試合数・代表での活動年・1試合あたりの得点 */
export const StatChips: React.FC<{
  player: RankedPlayer;
  frame: number;
  start: number;
  scale?: number;
}> = ({ player, frame, start, scale = 1 }) => {
  const items = [
    { label: "出場", value: String(player.caps), unit: "試合" },
    { label: "代表でプレーした年", value: player.years, unit: "" },
    { label: "1試合あたり", value: perGame(player), unit: "点" },
  ];
  return (
    <div style={{ display: "flex", gap: 18 * scale }}>
      {items.map((item, i) => {
        const t = enter(frame, start + i * 5, 12);
        return (
          <div
            key={item.label}
            style={{
              opacity: t,
              translate: `0px ${(1 - t) * 40}px`,
              borderLeft: `${6 * scale}px solid ${accentFor(player.rank)}`,
              backgroundColor: "rgba(255,255,255,0.09)",
              padding: `${16 * scale}px ${20 * scale}px ${18 * scale}px`,
              borderRadius: `0 ${12 * scale}px ${12 * scale}px 0`,
              flex: i === 1 ? 1.25 : 1,
            }}
          >
            <div
              style={{
                fontFamily: JP,
                fontWeight: 700,
                fontSize: 27 * scale,
                lineHeight: 1,
                color: C.dim,
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                marginTop: 12 * scale,
                fontFamily: NUM,
                fontWeight: 700,
                fontSize: 62 * scale,
                lineHeight: 1,
                color: C.white,
                whiteSpace: "nowrap",
              }}
            >
              {item.value}
              <span style={{ fontFamily: JP, fontWeight: 900, fontSize: 32 * scale, marginLeft: 6 }}>
                {item.unit}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const ActiveTag: React.FC<{ size: number }> = ({ size }) => (
  <span
    style={{
      fontFamily: JP,
      fontWeight: 900,
      fontSize: size,
      lineHeight: 1,
      color: C.white,
      backgroundColor: C.red,
      padding: `${size * 0.22}px ${size * 0.4}px`,
      borderRadius: size * 0.2,
      marginLeft: size * 0.6,
      letterSpacing: 2,
    }}
  >
    現役
  </span>
);
