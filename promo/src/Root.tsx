import "./index.css";
import { Composition } from "remotion";
import { StashPromo } from "./StashPromo";
import { MetaPromo } from "./MetaPromo";
import { ReceiptsPromo } from "./ReceiptsPromo";
import { SkwirlLaunch } from "./launch/SkwirlLaunch";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="SkwirlLaunch" component={SkwirlLaunch} durationInFrames={930} fps={30} width={1920} height={1080} />
      <Composition id="SkwirlLaunchVertical" component={SkwirlLaunch} durationInFrames={930} fps={30} width={1080} height={1920} />
      <Composition
        id="StashPromo"
        component={StashPromo}
        durationInFrames={1110}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="MetaPromo"
        component={MetaPromo}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="ReceiptsPromo"
        component={ReceiptsPromo}
        durationInFrames={480}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
