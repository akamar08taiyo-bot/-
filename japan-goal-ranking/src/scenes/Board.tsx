import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP, EASE_OUT, countUp, enter, slam } from "../anim";
import { GradientText } from "../components/Parts";
import { CUES } from "../schedule.mjs";
import type { RankedPlayer } from "../schedule.mjs";
import { C, GOLD_TEXT, JP, NUM, SAFE, accentFor, gradientFor } from "../theme";

const TOP = 352;
const ROW = 100;
const BAR_LEFT = 400;
const BAR_MAX = 350;

/** 最後のまとめ：全員を棒グラフで並べ、コメントを促す */
export const Board: React.FC<{ ranked: RankedPlayer[]; source: string; asOfLabel: string }> = ({
  ranked,
  source,
  asOfLabel,
}) => {
  const frame = useCurrentFrame();
  const max = ranked[0].goals;
  const cta = enter(frame, CUES.board.cta, 5);

  return (
    <AbsoluteFill>
      {ranked.map((p, i) => {
        const start = CUES.board.firstRow + i * CUES.board.rowGap;
        const t = enter(frame, start, 12);
        const grow = interpolate(frame, [start + 4, start + 30], [0, 1], { ...CLAMP, easing: EASE_OUT });
        const barWidth = (p.goals / max) * BAR_MAX * grow;
        const accent = accentFor(p.rank);
        const isTop3 = p.rank <= 3;

        return (
          <div
            key={p.name}
            style={{
              position: "absolute",
              left: SAFE.left - 20,
              top: TOP + i * ROW,
              width: SAFE.right - SAFE.left + 40,
              height: ROW - 12,
              opacity: t,
              translate: `${(1 - t) * -160}px 0px`,
              backgroundColor: isTop3 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
              borderLeft: `8px solid ${accent}`,
              borderRadius: "0 12px 12px 0",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 18,
                top: 0,
                height: "100%",
                width: 96,
                display: "flex",
                alignItems: "center",
              }}
            >
              <GradientText
                gradient={gradientFor(p.rank)}
                style={{ fontFamily: NUM, fontWeight: 900, fontStyle: "italic", fontSize: 72, lineHeight: 1 }}
              >
                {p.rank}
              </GradientText>
              <span style={{ fontFamily: JP, fontWeight: 900, fontSize: 26, color: C.dim, marginLeft: 4, marginTop: 20 }}>
                位
              </span>
            </div>

            <div
              style={{
                position: "absolute",
                left: 126,
                top: 0,
                height: "100%",
                display: "flex",
                alignItems: "center",
                fontFamily: JP,
                fontWeight: 900,
                fontSize: 54,
                lineHeight: 1,
                color: C.white,
                whiteSpace: "nowrap",
              }}
            >
              {p.name}
            </div>

            <div
              style={{
                position: "absolute",
                left: BAR_LEFT,
                top: (ROW - 12 - 40) / 2,
                width: barWidth,
                height: 40,
                borderRadius: "0 8px 8px 0",
                background: `linear-gradient(90deg, ${accent}55 0%, ${accent} 100%)`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: BAR_LEFT + barWidth + 16,
                top: 0,
                height: "100%",
                display: "flex",
                alignItems: "center",
                fontFamily: NUM,
                fontWeight: 900,
                fontStyle: "italic",
                fontSize: 74,
                lineHeight: 1,
                color: isTop3 ? accent : C.white,
              }}
            >
              {countUp(frame, start + 4, start + 30, p.goals)}
            </div>
          </div>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1366,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: cta,
          scale: slam(frame, CUES.board.cta, 1.5),
        }}
      >
        <div
          style={{
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 56,
            lineHeight: 1,
            color: C.white,
            whiteSpace: "nowrap",
            textShadow: "0 6px 20px rgba(0,0,0,0.5)",
          }}
        >
          あなたの思う
          <GradientText gradient={GOLD_TEXT}>最強ストライカー</GradientText>
          は？
        </div>
        <div
          style={{
            marginTop: 20,
            backgroundColor: C.red,
            color: C.white,
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 46,
            lineHeight: 1,
            padding: "14px 40px 18px",
            borderRadius: 40,
            scale: interpolate(Math.sin((frame - CUES.board.cta) / 4), [-1, 1], [1, 1.05]),
          }}
        >
          コメントで教えて！
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1532,
          textAlign: "center",
          fontFamily: JP,
          fontWeight: 700,
          fontSize: 24,
          lineHeight: 1,
          color: "rgba(255,255,255,0.5)",
          opacity: enter(frame, 30, 20),
        }}
      >
        {source}｜{asOfLabel}
      </div>
    </AbsoluteFill>
  );
};
