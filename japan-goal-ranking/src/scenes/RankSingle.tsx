import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { enter, flash, shake } from "../anim";
import { ActiveTag, GoalCount, RankBadge, Reveal, StatChips } from "../components/Parts";
import { CUES } from "../schedule.mjs";
import type { RankedPlayer } from "../schedule.mjs";
import { C, JP, NUM, SAFE, accentFor } from "../theme";

/** 背景にうっすら置く巨大な順位の数字 */
export const GhostNumber: React.FC<{ rank: number }> = ({ rank }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        right: -40,
        top: 330,
        fontFamily: NUM,
        fontWeight: 900,
        fontStyle: "italic",
        fontSize: 900,
        lineHeight: 0.8,
        color: "transparent",
        WebkitTextStroke: `5px ${accentFor(rank)}`,
        opacity: 0.13 * enter(frame, 0, 20),
        translate: `${-frame * 0.5}px 0px`,
      }}
    >
      {rank}
    </div>
  );
};

/** 1人だけの順位発表（10位・7位・6位・3位・2位） */
export const RankSingle: React.FC<{ player: RankedPlayer }> = ({ player }) => {
  const frame = useCurrentFrame();
  const cue = CUES.single;
  const hit = shake(frame, 0, 16, 9);
  const accent = accentFor(player.rank);
  const roman = enter(frame, cue.name + 6, 12);

  return (
    <AbsoluteFill style={{ translate: `${hit.x}px ${hit.y}px` }}>
      <GhostNumber rank={player.rank} />

      <div style={{ position: "absolute", left: SAFE.left, top: 400 }}>
        <RankBadge rank={player.rank} frame={frame} size={360} />
      </div>

      <Reveal frame={frame} start={cue.name} style={{ position: "absolute", left: SAFE.left, top: 742 }}>
        <div
          style={{
            fontFamily: JP,
            fontWeight: 900,
            fontSize: 172,
            lineHeight: 1.08,
            color: C.white,
            whiteSpace: "nowrap",
            textShadow: "0 10px 30px rgba(0,0,0,0.45)",
          }}
        >
          {player.name}
        </div>
      </Reveal>

      <div
        style={{
          position: "absolute",
          left: SAFE.left + 6,
          top: 968,
          display: "flex",
          alignItems: "center",
          opacity: roman,
          translate: `${(1 - roman) * -40}px 0px`,
        }}
      >
        <div style={{ width: 64, height: 8, backgroundColor: accent, marginRight: 20 }} />
        <span
          style={{
            fontFamily: NUM,
            fontWeight: 700,
            fontSize: 54,
            lineHeight: 1,
            letterSpacing: 5,
            color: accent,
            whiteSpace: "nowrap",
          }}
        >
          {player.roman}
        </span>
        {player.active ? <ActiveTag size={34} /> : null}
      </div>

      <div style={{ position: "absolute", left: SAFE.left, top: 1070 }}>
        <GoalCount
          goals={player.goals}
          frame={frame}
          start={cue.countStart}
          end={cue.countEnd}
          size={330}
        />
      </div>

      <div style={{ position: "absolute", left: SAFE.left, top: 1368, width: SAFE.right - SAFE.left }}>
        <StatChips player={player} frame={frame} start={cue.chips} scale={1.15} />
      </div>

      <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash(frame, 0, 0.35, 8) }} />
    </AbsoluteFill>
  );
};
