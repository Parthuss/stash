import "./index.css";
import { Composition } from "remotion";
import { StashPromo } from "./StashPromo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
