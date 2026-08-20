import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

// Reveals `text` character-by-character starting at `startFrame`, at
// `charsPerFrame` — a cheap but effective "typing" read for UI mockups.
export const ChatBubble: React.FC<{
  text: string;
  align: "left" | "right";
  startFrame?: number;
  charsPerFrame?: number;
  mono?: boolean;
}> = ({ text, align, startFrame = 0, charsPerFrame = 0.9, mono = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localFrame = Math.max(0, frame - startFrame);
  const visibleChars = Math.floor(localFrame * charsPerFrame);
  const shown = text.slice(0, visibleChars);
  const pop = spring({ frame: localFrame, fps, config: { damping: 14, mass: 0.5 } });

  if (visibleChars <= 0) return null;

  return (
    <div
      style={{
        alignSelf: align === "right" ? "flex-end" : "flex-start",
        maxWidth: "82%",
        background: align === "right" ? theme.accent : theme.panelLight,
        color: align === "right" ? "#FFFFFF" : theme.text,
        borderRadius: 18,
        borderBottomRightRadius: align === "right" ? 4 : 18,
        borderBottomLeftRadius: align === "left" ? 4 : 18,
        padding: "16px 20px",
        fontFamily: mono ? "'SF Mono', Menlo, monospace" : theme.font,
        fontSize: mono ? 18 : 21,
        lineHeight: 1.45,
        opacity: pop,
        transform: `scale(${0.85 + pop * 0.15})`,
        transformOrigin: align === "right" ? "bottom right" : "bottom left",
        whiteSpace: "pre-wrap",
      }}
    >
      {shown}
    </div>
  );
};
