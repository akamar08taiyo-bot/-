export type Player = {
  name: string;
  roman: string;
  goals: number;
  caps: number;
  years: string;
  active?: boolean;
};

export type RankedPlayer = Player & { rank: number; tied: boolean };

export type SceneType = "intro" | "single" | "tie" | "top" | "board";

export type Scene = {
  id: string;
  type: SceneType;
  rank?: number;
  bars: number;
  players: RankedPlayer[];
  startBar: number;
  from: number;
  durationInFrames: number;
};

export const FPS: number;
export const BPM: number;
export const FRAMES_PER_BEAT: number;
export const FRAMES_PER_BAR: number;
export const TOP_N: number;

export const CUES: {
  intro: { stamps: number[]; hook: number };
  single: { name: number; countStart: number; countEnd: number; chips: number };
  tie: { firstCard: number; cardGap: number; countDelay: number; countLength: number };
  top: {
    reveal: number;
    name: number;
    countStart: number;
    countEnd: number;
    chips: number;
    callout: number;
  };
  board: { firstRow: number; rowGap: number; cta: number };
};

export function rankPlayers(players: Player[]): RankedPlayer[];

export function buildSchedule(players: Player[]): {
  scenes: Scene[];
  ranked: RankedPlayer[];
  totalBars: number;
  durationInFrames: number;
};
