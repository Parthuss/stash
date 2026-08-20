import React from "react";
import { AbsoluteFill } from "remotion";
import { Background } from "./Background";
import { SectionLabel } from "./SectionLabel";
import { SectionHeadline } from "./SectionHeadline";
import { ClaudeChatMock } from "./ClaudeChatMock";
import { AutoZoom } from "./AutoZoom";

// Same label → headline → content rhythm as the caption scene, so scene 6
// reads as a continuation of one designed system. AutoZoom punches in on the
// recall card the moment it lands, then eases back out for the reply.
export const RecallScene: React.FC = () => {
  const zoomKeyframes = [
    { frame: 0, scale: 1, cx: 540, cy: 960 },
    { frame: 158, scale: 1, cx: 540, cy: 960 },
    { frame: 178, scale: 1.16, cx: 470, cy: 1100 },
    { frame: 255, scale: 1.16, cx: 470, cy: 1100 },
    { frame: 290, scale: 1, cx: 540, cy: 960 },
  ];

  return (
    <Background>
      <AutoZoom keyframes={zoomKeyframes}>
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            padding: "0 56px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 32, width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <SectionLabel text="MOMENTS LATER" />
              <SectionHeadline parts={["Claude", "already|#2F6FED", "knew."]} size={48} />
            </div>
            <ClaudeChatMock />
          </div>
        </AbsoluteFill>
      </AutoZoom>
    </Background>
  );
};
