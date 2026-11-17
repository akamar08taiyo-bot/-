// 動画全体のタイムライン。映像（src/）と音（scripts/make-audio.mjs）の両方がここを読むので、
// 選手データや尺を変えても絵と音がずれない。
// BPM150・30fps だと 1拍=12フレーム、1小節=48フレームで割り切れる。

export const FPS = 30;
export const BPM = 150;
export const FRAMES_PER_BEAT = (FPS * 60) / BPM;
export const FRAMES_PER_BAR = FRAMES_PER_BEAT * 4;
export const TOP_N = 10;

// 各場面の中で「何フレーム目に何が起きるか」。効果音もこの値に合わせて鳴らす。
export const CUES = {
  intro: { stamps: [0, 12, 24, 36], hook: 56 },
  single: { name: 8, countStart: 14, countEnd: 34, chips: 40 },
  tie: { firstCard: 14, cardGap: 56, countDelay: 6, countLength: 18 },
  top: { reveal: 48, name: 56, countStart: 62, countEnd: 92, chips: 100, callout: 134 },
  board: { firstRow: 6, rowGap: 4, cta: 104 },
};

/** 得点の多い順に並べ、同点は同順位（1,2,3,4,4,6…）にして TOP_N までを返す */
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.goals - a.goals || a.caps - b.caps);
  return sorted
    .map((p) => {
      const rank = 1 + sorted.filter((q) => q.goals > p.goals).length;
      return { ...p, rank, tied: sorted.filter((q) => q.goals === p.goals).length > 1 };
    })
    .filter((p) => p.rank <= TOP_N);
}

/** 場面の並びを作る：イントロ → 下位から発表 → 1位 → 一覧 */
export function buildSchedule(players) {
  const ranked = rankPlayers(players);
  const ranks = [...new Set(ranked.map((p) => p.rank))].sort((a, b) => b - a);

  const scenes = [{ id: "intro", type: "intro", bars: 2, players: [] }];
  for (const rank of ranks) {
    const group = ranked.filter((p) => p.rank === rank);
    const type = rank === 1 ? "top" : group.length > 1 ? "tie" : "single";
    const bars = type === "top" ? 4 : type === "tie" ? 3 : 2;
    scenes.push({ id: `rank-${rank}`, type, rank, bars, players: group });
  }
  scenes.push({ id: "board", type: "board", bars: 4, players: ranked });

  let bar = 0;
  for (const scene of scenes) {
    scene.startBar = bar;
    scene.from = bar * FRAMES_PER_BAR;
    scene.durationInFrames = scene.bars * FRAMES_PER_BAR;
    bar += scene.bars;
  }

  return { scenes, ranked, totalBars: bar, durationInFrames: bar * FRAMES_PER_BAR };
}
