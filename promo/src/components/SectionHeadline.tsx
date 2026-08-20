import React from "react";
import { loadFont } from "@remotion/google-fonts/DMSerifDisplay";
import { theme } from "../theme";

const { fontFamily } = loadFont();

// A word can carry its own color via "word|#hex" — mirrors the reference
// video's per-phrase emphasis (white → warm accent → dim) instead of one flat
// text color for the whole headline.
export const SectionHeadline: React.FC<{ parts: string[]; size?: number }> = ({
  parts,
  size = 46,
}) => (
  <div
    style={{
      fontFamily,
      fontSize: size,
      lineHeight: 1.15,
      color: theme.text,
    }}
  >
    {parts.map((part, i) => {
      const [word, color] = part.split("|");
      return (
        <span key={i} style={{ color: color || theme.text }}>
          {word}{" "}
        </span>
      );
    })}
  </div>
);
