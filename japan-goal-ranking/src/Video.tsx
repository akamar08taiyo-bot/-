import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { CLAMP, EASE_OUT } from "./anim";
import { Background } from "./components/Background";
import { Header } from "./components/Header";
import data from "./players.json";
import { CUES, buildSchedule } from "./schedule.mjs";
import type { Scene } from "./schedule.mjs";
import { Board } from "./scenes/Board";
import { Intro } from "./scenes/Intro";
import { RankSingle } from "./scenes/RankSingle";
import { RankTie } from "./scenes/RankTie";
import { RankTop } from "./scenes/RankTop";
import { accentFor } from "./theme";

export const schedule = buildSchedule(data.players);

const WIPE = 7;

/** 場面の切り替わりを斜めの帯で拭う（境目の直前で画面を覆い、直後に抜ける） */
const Wipe: React.FC<{ at: number; color: string }> = ({ at, color }) => {
  const frame = useCurrentFrame();
  if (frame < at - WIPE || frame > at + WIPE) return null;
  const x = interpolate(frame, [at - WIPE, at - 1, at, at + WIPE], [-135, 0, 0, 135], {
    ...CLAMP,
    easing: EASE_OUT,
  });
  return (
    <AbsoluteFill style={{ transform: `translateX(${x}%) skewX(-10deg) scaleX(1.3)` }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(90deg, ${color} 0%, #0B2280 12%, #0B2280 88%, ${color} 100%)`,
          borderLeft: "24px solid #fff",
          borderRight: "24px solid #fff",
        }}
      />
    </AbsoluteFill>
  );
};

const SceneBody: React.FC<{ scene: Scene }> = ({ scene }) => {
  if (scene.type === "intro") return <Intro asOfLabel={data.asOfLabel} />;
  if (scene.type === "single") return <RankSingle player={scene.players[0]} />;
  if (scene.type === "tie") return <RankTie players={scene.players} />;
  if (scene.type === "top") {
    const second = schedule.ranked.find((p) => p.rank > 1);
    return (
      <RankTop
        player={scene.players[0]}
        gapToSecond={scene.players[0].goals - (second ? second.goals : 0)}
      />
    );
  }
  return <Board ranked={schedule.ranked} source={data.source} asOfLabel={data.asOfLabel} />;
};

export const GoalRanking: React.FC<{ bgmVolume: number; sfxVolume: number }> = ({
  bgmVolume,
  sfxVolume,
}) => {
  const frame = useCurrentFrame();
  const current =
    schedule.scenes.find((s) => frame >= s.from && frame < s.from + s.durationInFrames) ??
    schedule.scenes[schedule.scenes.length - 1];
  const local = frame - current.from;

  // 発表済みの人数（上部の目盛り用）
  const revealed = schedule.scenes
    .filter((s) => s.rank !== undefined && s.from <= frame)
    .filter((s) => s.type !== "top" || frame >= s.from + CUES.top.reveal)
    .reduce((n, s) => n + s.players.length, 0);

  // 1位の前の「溜め」は暗くして、ヘッダーも消す
  const suspense = current.type === "top" && local < CUES.top.reveal;
  const dark = suspense ? interpolate(local, [0, 10], [0.4, 0.82], CLAMP) : 0;
  const headerOpacity = current.type === "intro" || suspense ? 0 : 1;

  return (
    <AbsoluteFill>
      <Background accent={accentFor(suspense ? undefined : current.rank)} dark={dark} />

      {schedule.scenes.map((scene) => (
        <Sequence
          key={scene.id}
          name={scene.id}
          from={scene.from}
          durationInFrames={scene.durationInFrames}
          premountFor={0}
        >
          <SceneBody scene={scene} />
        </Sequence>
      ))}

      <Header
        ranked={schedule.ranked}
        revealed={revealed}
        asOf={data.asOf}
        opacity={headerOpacity}
      />

      {schedule.scenes.slice(1).map((scene) => (
        <Wipe key={scene.id} at={scene.from} color={accentFor(scene.rank)} />
      ))}

      <Audio src={staticFile("audio/bgm.wav")} volume={bgmVolume} />
      <Audio src={staticFile("audio/sfx.wav")} volume={sfxVolume} />
    </AbsoluteFill>
  );
};
