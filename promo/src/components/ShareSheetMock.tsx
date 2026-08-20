import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "../theme";
import { StashIcon } from "./StashIcon";
import { Cursor } from "./Cursor";
import { AutoZoom } from "./AutoZoom";

const AppIcon: React.FC<{ emoji: string; label: string }> = ({ emoji, label }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
    <div
      style={{
        width: 74,
        height: 74,
        borderRadius: 19,
        background: theme.panelLight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 32,
      }}
    >
      {emoji}
    </div>
    <span style={{ fontSize: 16, color: theme.textDim, fontFamily: theme.font }}>{label}</span>
  </div>
);

// An iOS-style share sheet (system chrome, not Instagram's own UI) — drag
// handle, AirDrop row, app grid — with a real cursor tap landing on Stash,
// timed with an AutoZoom punch-in on the same spot.
export const ShareSheetMock: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideUp = spring({ frame, fps, config: { damping: 15, mass: 0.6 } });
  const sheetY = interpolate(slideUp, [0, 1], [760, 0]);

  const tapping = frame > 62 && frame < 80;
  const stashScale = tapping
    ? interpolate(frame, [62, 68, 80], [1, 0.88, 1.1], { extrapolateRight: "clamp" })
    : 1;

  const dismissY = interpolate(frame, [80, 92], [0, 900], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Tied to the actual open/dismiss frame ranges, not just sheetY's spring —
  // sheetY stays at its settled value through the dismiss (only dismissY
  // moves), so deriving backdrop opacity from sheetY alone left the dim
  // overlay stuck fully opaque after the sheet slid away.
  const backdropOpacity = interpolate(frame, [0, 20, 80, 92], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const zoomKeyframes = [
    { frame: 0, scale: 1, cx: 540, cy: 960 },
    { frame: 46, scale: 1, cx: 540, cy: 960 },
    { frame: 66, scale: 1.28, cx: 900, cy: 1560 },
    { frame: 92, scale: 1.28, cx: 900, cy: 1560 },
  ];

  return (
    <AutoZoom keyframes={zoomKeyframes}>
      <AbsoluteFill style={{ background: theme.bg }}>
        <AbsoluteFill style={{ justifyContent: "flex-end" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(20,22,28,0.28)",
              opacity: backdropOpacity,
            }}
          />
          <div
            style={{
              transform: `translateY(${sheetY + dismissY}px)`,
              background: theme.panel,
              borderTopLeftRadius: 36,
              borderTopRightRadius: 36,
              padding: "32px 30px 52px",
              display: "flex",
              flexDirection: "column",
              gap: 30,
              borderTop: `1px solid ${theme.border}`,
              boxShadow: "0 -20px 50px rgba(20,20,30,0.18)",
            }}
          >
            <div style={{ width: 56, height: 5, borderRadius: 3, background: theme.border, alignSelf: "center" }} />

            {/* AirDrop row (system chrome flavor) */}
            <div style={{ display: "flex", justifyContent: "space-around" }}>
              {["Nearby", "Priya", "Mac"].map((n) => (
                <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 58, height: 58, borderRadius: 29, background: theme.panelLight, border: `1px solid ${theme.border}` }} />
                  <span style={{ fontSize: 14, color: theme.textDim, fontFamily: theme.font }}>{n}</span>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: theme.border }} />

            <div style={{ fontFamily: theme.font, color: theme.textDim, fontSize: 19 }}>Share to</div>
            <div style={{ display: "flex", gap: 28, justifyContent: "space-between" }}>
              <AppIcon emoji="💬" label="Messages" />
              <AppIcon emoji="✉️" label="Mail" />
              <AppIcon emoji="📝" label="Notes" />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  transform: `scale(${stashScale})`,
                }}
              >
                <div style={{ boxShadow: tapping ? `0 0 0 6px ${theme.accentDim}` : "none", borderRadius: 19 }}>
                  <StashIcon size={74} />
                </div>
                <span
                  style={{
                    fontSize: 16,
                    color: tapping ? theme.accent : theme.textDim,
                    fontFamily: theme.font,
                    fontWeight: tapping ? 700 : 400,
                  }}
                >
                  Stash
                </span>
              </div>
            </div>
          </div>
        </AbsoluteFill>

        <Cursor
          from={{ x: 300, y: 1150 }}
          to={{ x: 900, y: 1560 }}
          startFrame={44}
          arriveFrame={64}
          fadeOutAt={78}
        />
      </AbsoluteFill>
    </AutoZoom>
  );
};
