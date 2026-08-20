import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";

// The real MCP tool name from stash/mcp_server.py — a small, cheap
// authenticity touch: this is what Claude actually calls.
export const ToolCallBlock: React.FC<{ query: string; startFrame?: number }> = ({
  query,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - startFrame);
  const pop = spring({ frame: local, fps, config: { damping: 14, mass: 0.5 } });

  if (local <= 0) return null;

  return (
    <div
      style={{
        alignSelf: "flex-start",
        opacity: pop,
        transform: `scale(${0.85 + pop * 0.15})`,
        transformOrigin: "left center",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(47,111,237,0.08)",
        border: `1px solid ${theme.accentDim}`,
        borderRadius: 12,
        padding: "10px 16px",
        fontFamily: "'SF Mono', Menlo, monospace",
        fontSize: 16,
        color: theme.accent,
      }}
    >
      <span style={{ fontSize: 14 }}>⚙</span>
      search_stash(query: "{query}")
    </div>
  );
};
