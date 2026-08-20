import React from "react";
import { theme } from "../theme";

// The small tracked-caps chip that precedes every headline — the repeated
// beat (label → headline → content) is what gives the reference video its
// "one system" feel instead of each scene inventing its own layout.
export const SectionLabel: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      fontFamily: theme.font,
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: 2.5,
      textTransform: "uppercase",
      color: theme.accent,
    }}
  >
    {text}
  </div>
);
