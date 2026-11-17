import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP } from "../anim";
import { FRAMES_PER_BEAT } from "../schedule.mjs";

/** 紺のグラデーション＋流れる斜めストライプ＋拍に合わせて脈打つ光 */
export const Background: React.FC<{ accent: string; dark?: number }> = ({ accent, dark = 0 }) => {
  const frame = useCurrentFrame();
  const beat = (frame % FRAMES_PER_BEAT) / FRAMES_PER_BEAT;
  const pulse = interpolate(beat, [0, 0.15, 1], [0.6, 1, 0.6], CLAMP);

  return (
    <AbsoluteFill style={{ backgroundColor: "#040A22" }}>
      <AbsoluteFill
        style={{ background: "linear-gradient(165deg, #040A22 0%, #0B2280 52%, #050D33 100%)" }}
      />
      <AbsoluteFill
        style={{
          background:
            "repeating-linear-gradient(115deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 70px, transparent 70px, transparent 230px)",
          backgroundPosition: `${frame * 2.2}px 0px`,
        }}
      />
      {/* ピッチのセンターサークル */}
      <svg width={1080} height={1920} style={{ position: "absolute", opacity: 0.09 }}>
        <circle cx={540} cy={1560} r={330} fill="none" stroke="#fff" strokeWidth={6} />
        <circle cx={540} cy={1560} r={12} fill="#fff" />
        <line x1={0} y1={1560} x2={1080} y2={1560} stroke="#fff" strokeWidth={6} />
      </svg>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 700px at 50% 22%, ${accent} 0%, transparent 70%)`,
          opacity: 0.2 * pulse,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(1200px 1500px at 50% 45%, transparent 40%, rgba(0,0,0,0.62) 100%)",
        }}
      />
      <AbsoluteFill style={{ backgroundColor: "#01030C", opacity: dark }} />
    </AbsoluteFill>
  );
};
