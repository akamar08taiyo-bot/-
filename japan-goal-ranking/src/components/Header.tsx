import React from "react";
import { C, JP, NUM, SAFE, accentFor } from "../theme";
import type { RankedPlayer } from "../schedule.mjs";

export const Hinomaru: React.FC<{ height: number }> = ({ height }) => (
  <div
    style={{
      width: height * 1.5,
      height,
      borderRadius: height * 0.12,
      backgroundColor: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: height * 0.6,
        height: height * 0.6,
        borderRadius: "50%",
        backgroundColor: C.red,
      }}
    />
  </div>
);

/** 画面上部に常に出ているタイトルと、何位まで発表したかの目盛り */
export const Header: React.FC<{
  ranked: RankedPlayer[];
  revealed: number;
  asOf: string;
  opacity: number;
}> = ({ ranked, revealed, asOf, opacity }) => {
  // 10位 → 1位の順に左から並べる
  const order = [...ranked].reverse();

  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        top: SAFE.top,
        width: 1080 - SAFE.left * 2,
        opacity,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <Hinomaru height={52} />
        <div
          style={{
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 52,
            lineHeight: 1,
            color: C.white,
            letterSpacing: 1,
            whiteSpace: "nowrap",
          }}
        >
          日本代表 歴代ゴール数ランキング
        </div>
      </div>
      <div
        style={{
          marginTop: 18,
          fontFamily: JP,
          fontWeight: 700,
          fontSize: 31,
          lineHeight: 1,
          color: C.dim,
          whiteSpace: "nowrap",
        }}
      >
        男子A代表・国際Aマッチ通算
        <span style={{ fontFamily: NUM, fontSize: 36, marginLeft: 18, letterSpacing: 1 }}>
          {asOf}
        </span>{" "}
        時点
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
        {order.map((p, i) => (
          <div
            key={p.name}
            style={{
              flex: 1,
              height: 10,
              borderRadius: 5,
              backgroundColor: i < revealed ? accentFor(p.rank) : "rgba(255,255,255,0.16)",
            }}
          />
        ))}
      </div>
    </div>
  );
};
