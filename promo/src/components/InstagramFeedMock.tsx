import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { theme } from "../theme";
import { AutoZoom } from "./AutoZoom";
import { Cursor } from "./Cursor";
import { BookmarkIcon, CommentIcon, DotsIcon, HeartIcon, MusicNoteIcon, ShareArrowIcon } from "./icons";

const RailItem: React.FC<{ icon: React.ReactNode; count?: string; active?: boolean; scale?: number }> = ({
  icon,
  count,
  scale = 1,
}) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      transform: `scale(${scale})`,
    }}
  >
    <div style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}>{icon}</div>
    {count ? (
      <span style={{ color: "#fff", fontSize: 15, fontWeight: 600, fontFamily: theme.font, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>
        {count}
      </span>
    ) : null}
  </div>
);

// A closer recreation of a reel's real chrome — action rail, follow pill,
// caption, audio ticker — with a synthetic tap on the share icon that
// AutoZoom punches in on, instead of a static full-frame shot.
export const InstagramFeedMock: React.FC = () => {
  const frame = useCurrentFrame();

  const scrollY = interpolate(frame, [0, 40], [420, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const chromeOpacity = interpolate(frame, [40, 62], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const tapPulse = interpolate(frame, [128, 140, 150], [1, 1.4, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const zoomKeyframes = [
    { frame: 0, scale: 1, cx: 540, cy: 960 },
    { frame: 108, scale: 1, cx: 540, cy: 960 },
    { frame: 150, scale: 1.32, cx: 970, cy: 1500 },
  ];

  return (
    <AutoZoom keyframes={zoomKeyframes}>
      <AbsoluteFill style={{ background: "#000", transform: `translateY(${scrollY}px)` }}>
        <Img
          src={staticFile("video-shotcraft-frame.jpg")}
          style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.8)" }}
        />
        <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.35), transparent 22%, transparent 60%, rgba(0,0,0,0.65))" }} />

        {/* top bar */}
        <div
          style={{
            position: "absolute",
            top: 78,
            left: 32,
            right: 32,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            opacity: chromeOpacity,
          }}
        >
          <span style={{ color: "#fff", fontSize: 24, fontWeight: 700, fontFamily: theme.font, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
            Reels
          </span>
          <DotsIcon size={22} />
        </div>

        {/* bottom-left: profile / caption / audio */}
        <div style={{ position: "absolute", left: 28, right: 150, bottom: 76, opacity: chromeOpacity }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentStrong})`,
                border: "1.5px solid #fff",
              }}
            />
            <span style={{ color: "#fff", fontSize: 20, fontWeight: 700, fontFamily: theme.font }}>
              builder.brody
            </span>
            <div
              style={{
                border: "1.5px solid #fff",
                borderRadius: 8,
                padding: "3px 12px",
                color: "#fff",
                fontSize: 15,
                fontWeight: 700,
                fontFamily: theme.font,
              }}
            >
              Follow
            </div>
          </div>
          <div style={{ color: "#fff", fontSize: 20, lineHeight: 1.4, fontFamily: theme.font, marginBottom: 12 }}>
            Claude turns product screenshots into cinematic video 🎬
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MusicNoteIcon size={15} />
            <span style={{ color: "#fff", fontSize: 15, fontFamily: theme.font, opacity: 0.9 }}>
              original audio — builder.brody
            </span>
          </div>
        </div>

        {/* action rail */}
        <div
          style={{
            position: "absolute",
            right: 24,
            bottom: 170,
            display: "flex",
            flexDirection: "column",
            gap: 32,
            opacity: chromeOpacity,
          }}
        >
          <RailItem icon={<HeartIcon />} count="48.2k" />
          <RailItem icon={<CommentIcon />} count="312" />
          <RailItem icon={<ShareArrowIcon />} count="Share" scale={tapPulse} />
          <RailItem icon={<BookmarkIcon />} />
          <RailItem icon={<DotsIcon size={20} />} />
        </div>

        <Cursor
          from={{ x: 1060, y: 1980 }}
          to={{ x: 970, y: 1500 }}
          startFrame={112}
          arriveFrame={142}
          fadeOutAt={150}
        />
      </AbsoluteFill>
    </AutoZoom>
  );
};
