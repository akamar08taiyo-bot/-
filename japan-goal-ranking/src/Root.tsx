import { Composition } from "remotion";
import { FPS } from "./schedule.mjs";
import { GoalRanking, schedule } from "./Video";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="GoalRanking"
      component={GoalRanking}
      durationInFrames={schedule.durationInFrames}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ bgmVolume: 0.6, sfxVolume: 0.8 }}
    />
  );
};
