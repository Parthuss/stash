import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { StashIcon } from "./StashIcon";
import { Background } from "./Background";

export const OutroCard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 15 } });

  return (
    <Background>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            transform: `scale(${enter})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 26,
            padding: "0 90px",
          }}
        >
          <StashIcon size={96} />
          <div
            style={{
              fontFamily: theme.font,
              fontSize: 52,
              fontWeight: 800,
              color: theme.text,
              letterSpacing: -0.5,
            }}
          >
            Stash
          </div>
          <div
            style={{
              fontFamily: theme.font,
              fontSize: 26,
              color: theme.textDim,
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            Capture that survives you forgetting.
            <br />
            Recall that doesn't wait to be asked.
          </div>
        </div>
      </AbsoluteFill>
    </Background>
  );
};
