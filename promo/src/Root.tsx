import "./index.css";
import { Composition } from "remotion";
import { StashPromo } from "./StashPromo";
import { SkwirlLaunch } from "./launch/SkwirlLaunch";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="SkwirlLaunch" component={SkwirlLaunch} durationInFrames={930} fps={30} width={1920} height={1080} />
      <Composition
        id="StashPromo"
        component={StashPromo}
        durationInFrames={1110}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
