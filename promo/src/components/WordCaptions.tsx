import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { theme } from "../theme";

// The word-by-word "karaoke" caption style most reels carry now — built on
// Remotion's own @remotion/captions helper (createTikTokStyleCaptions groups
// whisper's word-level output into short on-screen phrases), not a custom
// grouping heuristic. Captions are local to whichever scene passes them in
// (word timestamps are relative to that scene's own voiceover clip, same as
// the <Audio> it plays), so this needs no global timeline of its own.
export const WordCaptions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;

  const { pages } = createTikTokStyleCaptions({
    captions,
    combineTokensWithinMilliseconds: 1200,
  });

  const page = pages.find((p) => ms >= p.startMs && ms < p.startMs + p.durationMs);
  if (!page) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        bottom: 210,
        textAlign: "center",
        fontFamily: theme.font,
        fontWeight: 800,
        fontSize: 40,
        lineHeight: 1.35,
        zIndex: 100,
      }}
    >
      {page.tokens.map((token, i) => {
        const active = ms >= token.fromMs && ms < token.toMs;
        return (
          <span
            key={i}
            style={{
              color: "#fff",
              WebkitTextStroke: "8px rgba(0,0,0,0.75)",
              paintOrder: "stroke fill",
              background: active ? theme.accent : "transparent",
              borderRadius: active ? 8 : 0,
              padding: active ? "2px 8px" : 0,
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
            }}
          >
            {token.text}
          </span>
        );
      })}
    </div>
  );
};
