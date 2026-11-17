import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { enter, flash, shake } from "../anim";
import { ActiveTag, GoalCount, RankBadge, perGame } from "../components/Parts";
import { CUES } from "../schedule.mjs";
import type { RankedPlayer } from "../schedule.mjs";
import { C, JP, NUM, SAFE, accentFor } from "../theme";
import { GhostNumber } from "./RankSingle";

const CARD_HEIGHT = 400;

const PlayerCard: React.FC<{ player: RankedPlayer; start: number; top: number; fromLeft: boolean }> = ({
  player,
  start,
  top,
  fromLeft,
}) => {
  const frame = useCurrentFrame();
  const t = enter(frame, start, 14);
  const accent = accentFor(player.rank);
  const countStart = start + CUES.tie.countDelay;

  return (
    <div
      style={{
        position: "absolute",
        left: 50,
        top,
        width: 980,
        height: CARD_HEIGHT,
        opacity: enter(frame, start, 5),
        translate: `${(1 - t) * (fromLeft ? -1100 : 1100)}px 0px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(100deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 100%)",
          borderLeft: `14px solid ${accent}`,
          borderRadius: "0 22px 22px 0",
          boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
        }}
      />

      <div style={{ position: "absolute", left: 50, top: 40 }}>
        <div
          style={{
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 124,
            lineHeight: 1.1,
            color: C.white,
            whiteSpace: "nowrap",
          }}
        >
          {player.name}
        </div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
          <span
            style={{
              fontFamily: NUM,
              fontWeight: 700,
              fontSize: 42,
              lineHeight: 1,
              letterSpacing: 4,
              color: accent,
              whiteSpace: "nowrap",
            }}
          >
            {player.roman}
          </span>
          {player.active ? <ActiveTag size={28} /> : null}
        </div>
      </div>

      <div style={{ position: "absolute", right: 150, top: 44 }}>
        <GoalCount
          goals={player.goals}
          frame={frame}
          start={countStart}
          end={countStart + CUES.tie.countLength}
          size={220}
          labelSize={46}
          column
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: 50,
          bottom: 38,
          display: "flex",
          alignItems: "baseline",
          gap: 34,
          opacity: enter(frame, countStart + 12, 12),
          fontFamily: NUM,
          fontWeight: 700,
          fontSize: 56,
          lineHeight: 1,
          color: C.white,
          whiteSpace: "nowrap",
        }}
      >
        <span>
          {player.caps}
          <span style={{ fontFamily: JP, fontWeight: 900, fontSize: 32, marginLeft: 4 }}>試合</span>
        </span>
        <span style={{ color: C.dim }}>{player.years}</span>
        <span>
          <span style={{ fontFamily: JP, fontWeight: 700, fontSize: 28, color: C.dim, marginRight: 8 }}>
            1試合あたり
          </span>
          {perGame(player)}
          <span style={{ fontFamily: JP, fontWeight: 900, fontSize: 32, marginLeft: 4 }}>点</span>
        </span>
      </div>
    </div>
  );
};

/** 同点で並んだ順位の発表（8位タイ・4位タイ） */
export const RankTie: React.FC<{ players: RankedPlayer[] }> = ({ players }) => {
  const frame = useCurrentFrame();
  const hit = shake(frame, 0, 16, 9);
  const rank = players[0].rank;

  return (
    <AbsoluteFill style={{ translate: `${hit.x}px ${hit.y}px` }}>
      <GhostNumber rank={rank} />

      <div style={{ position: "absolute", left: SAFE.left, top: 372 }}>
        <RankBadge rank={rank} frame={frame} size={270} tied />
      </div>

      {players.map((player, i) => (
        <PlayerCard
          key={player.name}
          player={player}
          start={CUES.tie.firstCard + i * CUES.tie.cardGap}
          top={640 + i * (CARD_HEIGHT + 30)}
          fromLeft={i % 2 === 0}
        />
      ))}

      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash(frame, 0, 0.35, 8) }} />
    </AbsoluteFill>
  );
};
