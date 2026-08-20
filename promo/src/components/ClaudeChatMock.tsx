import React from "react";
import { spring, useCurrentFrame, useVideoConfig, Img, staticFile } from "remotion";

// A recreation of the real Claude Code CLI — dark terminal, monospace,
// bullet-point (⏺) turns and ⎿ tool results, not a chat-bubble app. Local
// dark palette on purpose: this is Claude Code's own UI being matched, not
// Stash's brand chrome.
const term = {
  bg: "#191919",
  panel: "#202020",
  border: "#2E2E2E",
  text: "#EDEDED",
  dim: "#8C8C8C",
  accent: "#D97757",
  mono: "'SF Mono', Menlo, Consolas, monospace",
};

const Typed: React.FC<{
  text: string;
  startFrame: number;
  charsPerFrame?: number;
  style?: React.CSSProperties;
}> = ({ text, startFrame, charsPerFrame = 1.1, style }) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - startFrame);
  const shown = text.slice(0, Math.floor(local * charsPerFrame));
  if (shown.length === 0) return null;
  return <span style={style}>{shown}</span>;
};

const PopIn: React.FC<{ startFrame: number; children: React.ReactNode }> = ({
  startFrame,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - startFrame);
  const pop = spring({ frame: local, fps, config: { damping: 14, mass: 0.5 } });
  if (local <= 0) return null;
  return (
    <div style={{ opacity: pop, transform: `scale(${0.92 + pop * 0.08})`, transformOrigin: "top left" }}>
      {children}
    </div>
  );
};

const USER_TEXT = "wait didn't I save something about motion design with Claude Code?";
const ASSISTANT_TEXT =
  "Found it — saved a few days ago. Literally the tool this promo was made with.";

export const ClaudeChatMock: React.FC = () => {
  return (
    <div
      style={{
        background: term.bg,
        border: `1px solid ${term.border}`,
        borderRadius: 14,
        boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: term.mono,
      }}
    >
      {/* terminal chrome */}
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          borderBottom: `1px solid ${term.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: 6, background: "#FF5F57" }} />
        <div style={{ width: 12, height: 12, borderRadius: 6, background: "#FFBD2E" }} />
        <div style={{ width: 12, height: 12, borderRadius: 6, background: "#28C840" }} />
        <div style={{ flex: 1, textAlign: "center", fontSize: 13, color: term.dim }}>
          claude — stash
        </div>
        <div style={{ width: 56 }} />
      </div>

      <div style={{ padding: "22px 26px 28px", display: "flex", flexDirection: "column", gap: 16, fontSize: 15 }}>
        {/* user turn */}
        <PopIn startFrame={16}>
          <div
            style={{
              border: `1px solid ${term.border}`,
              borderRadius: 8,
              padding: "9px 14px",
              color: term.text,
            }}
          >
            <span style={{ color: term.dim }}>{"> "}</span>
            <Typed text={USER_TEXT} startFrame={20} charsPerFrame={1.15} style={{ color: term.text }} />
          </div>
        </PopIn>

        {/* tool call */}
        <PopIn startFrame={98}>
          <div style={{ display: "flex", gap: 8, color: term.dim }}>
            <span style={{ color: term.accent }}>⏺</span>
            <span>
              Search(query: <span style={{ color: term.text }}>"claude code motion design remotion"</span>)
            </span>
          </div>
        </PopIn>

        {/* tool result summary */}
        <PopIn startFrame={120}>
          <div style={{ display: "flex", gap: 8, color: term.dim, marginTop: -6 }}>
            <span>{"  ⎿ "}</span>
            <span>Found 1 matching note in vault</span>
          </div>
        </PopIn>

        {/* recalled note, rendered like a tool result attachment */}
        <PopIn startFrame={150}>
          <div style={{ paddingLeft: 20 }}>
            <div
              style={{
                display: "flex",
                gap: 14,
                background: term.panel,
                border: `1px solid ${term.border}`,
                borderRadius: 10,
                padding: 12,
              }}
            >
              <Img
                src={staticFile("motion-design-thumb.jpg")}
                style={{ width: 84, height: 84, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
              />
              <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: term.accent, fontWeight: 700, letterSpacing: 0.3 }}>
                  FROM YOUR VAULT
                </div>
                <div style={{ fontSize: 15, color: term.text, fontWeight: 700, lineHeight: 1.3 }}>
                  Generate motion graphics with Claude Code and Remotion
                </div>
                <div style={{ fontSize: 13, color: term.dim, lineHeight: 1.4 }}>
                  Describe what you want — Claude Code writes the Remotion project for you.
                </div>
              </div>
            </div>
          </div>
        </PopIn>

        {/* assistant reply */}
        <PopIn startFrame={220}>
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ color: term.accent }}>⏺</span>
            <Typed text={ASSISTANT_TEXT} startFrame={220} charsPerFrame={1.1} style={{ color: term.text }} />
          </div>
        </PopIn>
      </div>
    </div>
  );
};
