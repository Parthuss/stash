import React from "react";
import { Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

// The payoff: the exact note recalled unprompted, matching the reel actually
// captured in scene 1 (Generate motion graphics with Claude Code and
// Remotion) — same title card, closes the loop for real this time.
export const RecallCard: React.FC<{ startFrame?: number }> = ({ startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - startFrame);
  const enter = spring({ frame: local, fps, config: { damping: 14, mass: 0.7 } });

  if (local <= 0) return null;

  return (
    <div
      style={{
        alignSelf: "flex-start",
        transform: `scale(${enter})`,
        transformOrigin: "top left",
        display: "flex",
        gap: 16,
        background: theme.panelLight,
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        padding: 14,
        maxWidth: "88%",
      }}
    >
      <Img
        src={staticFile("motion-design-thumb.jpg")}
        style={{ width: 96, height: 96, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
      />
      <div style={{ fontFamily: theme.font, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 15, color: theme.accent, fontWeight: 700, letterSpacing: 0.3 }}>
          FROM YOUR VAULT
        </div>
        <div style={{ fontSize: 18, color: theme.text, fontWeight: 700, lineHeight: 1.3 }}>
          Generate motion graphics with Claude Code and Remotion
        </div>
        <div style={{ fontSize: 15, color: theme.textDim, lineHeight: 1.4 }}>
          Describe what you want — Claude Code writes the Remotion project for you.
        </div>
      </div>
    </div>
  );
};
