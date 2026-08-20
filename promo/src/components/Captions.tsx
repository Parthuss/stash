import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Background } from "./Background";
import { SectionLabel } from "./SectionLabel";
import { SectionHeadline } from "./SectionHeadline";

export const Captions: React.FC<{ label: string; parts: string[] }> = ({
  label,
  parts,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 12], [0.92, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Background>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scale})`,
        }}
      >
        <div style={{ padding: "0 90px", display: "flex", flexDirection: "column", gap: 16 }}>
          <SectionLabel text={label} />
          <SectionHeadline parts={parts} size={50} />
        </div>
      </AbsoluteFill>
    </Background>
  );
};
