import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { StashIcon } from "./StashIcon";

// One iOS-style banner: appears (frames [0, appearIn]), holds, then leaves
// starting at leaveAt. Local frame is relative to whatever holds this.
export const NotificationToast: React.FC<{
  title: string;
  body: string;
  appearIn?: number;
  leaveAt: number;
  leaveOut?: number;
  top?: number;
}> = ({ title, body, appearIn = 10, leaveAt, leaveOut = 12, top = 78 }) => {
  const frame = useCurrentFrame();
  const inY = interpolate(frame, [0, appearIn], [-140, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outY = interpolate(frame, [leaveAt, leaveAt + leaveOut], [0, -160], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = interpolate(
    frame,
    [0, appearIn, leaveAt, leaveAt + leaveOut],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 24,
        right: 24,
        transform: `translateY(${inY + outY}px)`,
        opacity,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(20px)",
        borderRadius: 22,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        border: `1px solid ${theme.border}`,
        boxShadow: "0 12px 30px rgba(20,20,30,0.16)",
      }}
    >
      <StashIcon size={44} />
      <div style={{ fontFamily: theme.font, color: theme.text }}>
        <div style={{ fontSize: 19, fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 17, color: theme.textDim, marginTop: 2 }}>{body}</div>
      </div>
    </div>
  );
};
