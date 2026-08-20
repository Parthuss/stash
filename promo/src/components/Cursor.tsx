import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { theme } from "../theme";

// A synthetic fingertip: flies in along a slight arc (quadratic bezier, not a
// straight line — real touch input never is), presses down, and ripples on
// contact. This is what makes actions read as *performed* rather than
// merely *happening* — the reference video's whole trick.
export const Cursor: React.FC<{
  from: { x: number; y: number };
  to: { x: number; y: number };
  startFrame: number;
  arriveFrame: number;
  fadeOutAt?: number;
}> = ({ from, to, startFrame, arriveFrame, fadeOutAt }) => {
  const frame = useCurrentFrame();

  const progress = interpolate(frame, [startFrame, arriveFrame], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  const midX = (from.x + to.x) / 2;
  const midY = Math.min(from.y, to.y) - 90;
  const x =
    (1 - progress) ** 2 * from.x + 2 * (1 - progress) * progress * midX + progress ** 2 * to.x;
  const y =
    (1 - progress) ** 2 * from.y + 2 * (1 - progress) * progress * midY + progress ** 2 * to.y;

  const rippleLocal = frame - arriveFrame;
  const rippleScale = interpolate(rippleLocal, [0, 22], [0.3, 2.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rippleOpacity = interpolate(rippleLocal, [0, 22], [0.65, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pressScale =
    rippleLocal >= 0 && rippleLocal < 12
      ? interpolate(rippleLocal, [0, 5, 12], [1, 0.7, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 1;

  const end = fadeOutAt ?? arriveFrame + 30;
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + 6, end, end + 12],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  if (opacity <= 0) return null;

  return (
    <div style={{ position: "absolute", left: x, top: y, opacity, pointerEvents: "none", zIndex: 50 }}>
      {rippleLocal >= 0 && (
        <div
          style={{
            position: "absolute",
            width: 60,
            height: 60,
            left: -30,
            top: -30,
            borderRadius: 999,
            border: `2.5px solid ${theme.accent}`,
            transform: `scale(${rippleScale})`,
            opacity: rippleOpacity,
          }}
        />
      )}
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          background: theme.accent,
          border: "3px solid #fff",
          boxShadow: "0 0 14px rgba(47,111,237,0.7), 0 3px 10px rgba(0,0,0,0.35)",
          transform: `translate(-50%, -50%) scale(${pressScale})`,
        }}
      />
    </div>
  );
};
