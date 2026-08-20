import React from "react";
import { AbsoluteFill } from "remotion";
import { theme } from "../theme";

// The one background every "info" scene (5, 6, 7) shares — a subtle grid +
// vignette. Reusing this exact canvas across scenes is what makes them read
// as one authored piece instead of disconnected slides; each scene stopped
// carrying its own flat, unrelated background color.
export const Background: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 50% 30%, #FFFFFF 0%, ${theme.bg} 70%)`,
    }}
  >
    <AbsoluteFill
      style={{
        backgroundImage: `linear-gradient(${theme.border} 1px, transparent 1px), linear-gradient(90deg, ${theme.border} 1px, transparent 1px)`,
        backgroundSize: "64px 64px",
        opacity: 0.7,
      }}
    />
    {children}
  </AbsoluteFill>
);
