import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { enter, flash, shake, slam } from "../anim";
import { GradientText } from "../components/Parts";
import { Hinomaru } from "../components/Header";
import { CUES, TOP_N } from "../schedule.mjs";
import { C, GOLD_TEXT, JP, NUM } from "../theme";

const Stamp: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  at,
  children,
  style,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: enter(frame, at, 3),
        scale: slam(frame, at, 2.2),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** 冒頭：拍ごとにタイトルを叩きつけて、最後に「1位は…」の引きを出す */
export const Intro: React.FC<{ asOfLabel: string }> = ({ asOfLabel }) => {
  const frame = useCurrentFrame();
  const [s0, s1, s2, s3] = CUES.intro.stamps;
  const hit = shake(frame, s3, 26, 12);
  const hook = enter(frame, CUES.intro.hook, 12);

  return (
    <AbsoluteFill style={{ translate: `${hit.x}px ${hit.y}px` }}>
      <Stamp at={s0} style={{ position: "absolute", top: 430, left: 0, right: 0, gap: 26 }}>
        <Hinomaru height={74} />
        <span style={{ fontFamily: JP, fontWeight: 900, fontSize: 84, lineHeight: 1, color: C.white }}>
          サッカー日本代表
        </span>
      </Stamp>

      <Stamp at={s1} style={{ position: "absolute", top: 570, left: 0, right: 0 }}>
        <span
          style={{
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 158,
            lineHeight: 1.1,
            color: C.white,
            textShadow: "0 10px 30px rgba(0,0,0,0.5)",
          }}
        >
          歴代ゴール数
        </span>
      </Stamp>

      <Stamp at={s2} style={{ position: "absolute", top: 760, left: 0, right: 0 }}>
        <span
          style={{
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 158,
            lineHeight: 1.1,
            color: C.cyan,
            textShadow: "0 10px 30px rgba(0,0,0,0.5)",
          }}
        >
          ランキング
        </span>
      </Stamp>

      <Stamp at={s3} style={{ position: "absolute", top: 960, left: 0, right: 0 }}>
        <GradientText
          gradient={GOLD_TEXT}
          style={{
            fontFamily: NUM,
            fontWeight: 900,
            fontStyle: "italic",
            fontSize: 380,
            lineHeight: 0.9,
            filter: "drop-shadow(0 14px 30px rgba(0,0,0,0.5))",
          }}
        >
          TOP{TOP_N}
        </GradientText>
      </Stamp>

      <div
        style={{
          position: "absolute",
          top: 1335,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: hook,
          translate: `${(1 - hook) * -120}px 0px`,
        }}
      >
        <div
          style={{
            backgroundColor: C.red,
            padding: "22px 44px 26px",
            transform: "skewX(-8deg)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.4)",
          }}
        >
          <div
            style={{
              transform: "skewX(8deg)",
              fontFamily: JP,
              fontWeight: 900,
              fontSize: 54,
              lineHeight: 1,
              color: C.white,
              whiteSpace: "nowrap",
            }}
          >
            1位は約半世紀、誰も届かない大記録
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 1462,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: JP,
          fontWeight: 700,
          fontSize: 32,
          lineHeight: 1,
          color: C.dim,
          opacity: hook,
        }}
      >
        男子A代表・国際Aマッチ通算（{asOfLabel}）
      </div>

      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash(frame, s3, 0.7) }} />
    </AbsoluteFill>
  );
};
