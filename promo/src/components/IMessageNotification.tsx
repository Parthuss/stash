import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";

// Modeled on a real completion notification from this exact pipeline (an
// actual iMessage banner, screenshotted, sender's last name dropped here) —
// full note metadata comes through: title, topic · tools, source URL. Not a
// generic "saved" ping — this is what really lands on the phone.
export const IMessageNotification: React.FC<{
  appearIn?: number;
  leaveAt: number;
  leaveOut?: number;
  top?: number;
}> = ({ appearIn = 10, leaveAt, leaveOut = 14, top = 78 }) => {
  const frame = useCurrentFrame();
  const inY = interpolate(frame, [0, appearIn], [-160, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const outY = interpolate(frame, [leaveAt, leaveAt + leaveOut], [0, -180], {
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
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(20px)",
        borderRadius: 22,
        padding: "16px 18px",
        display: "flex",
        gap: 14,
        border: `1px solid ${theme.border}`,
        boxShadow: "0 12px 30px rgba(20,20,30,0.16)",
        fontFamily: theme.font,
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            background: `linear-gradient(160deg, ${theme.accent}, ${theme.accentStrong})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 18,
          }}
        >
          P
        </div>
        <div
          style={{
            position: "absolute",
            bottom: -3,
            right: -3,
            width: 19,
            height: 19,
            borderRadius: 10,
            background: theme.success,
            border: "2px solid #fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none">
            <path d="M4 12.5 9.5 18 20 6" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>Parth</span>
          <span style={{ fontSize: 13, color: theme.textDim }}>now</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, lineHeight: 1.3 }}>
          ✅ Claude Code + Remotion for AI-Generated Motion Graphics
        </div>
        <div style={{ fontSize: 14, color: theme.textDim, marginTop: 3 }}>
          tooling · claude-code, remotion
        </div>
        <div style={{ fontSize: 14, color: theme.accent, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          https://www.instagram.com/reel/DZSJJ9Do...
        </div>
      </div>
    </div>
  );
};
