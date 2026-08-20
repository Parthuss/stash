import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile } from "remotion";
import { AutoZoom } from "./AutoZoom";

// Real screen recording (cropped to the phone screen, contacts and avatars
// blurred, typing sped up), played full-bleed with the camera punching in on
// each action. The source is taller than the frame, so AutoZoom pans as well
// as zooms — hence the explicit content bounds.
const SRC_W = 562;
const SRC_H = 1330;
const CONTENT_W = 1080;
const SCALE = CONTENT_W / SRC_W;
const CONTENT_H = SRC_H * SCALE;

const at = (x: number, y: number) => ({ cx: x * SCALE, cy: y * SCALE });

const CENTER = { cx: CONTENT_W / 2, cy: CONTENT_H / 2 };
const SHARE_ICON = at(531, 940);
const VIEW_MORE = at(479, 1142);
const STASH_ROW = at(150, 1232);
const DONE_BUTTON = at(412, 425);

export const CaptureScene: React.FC = () => {
  // Leads with 1.75s (52 frames) of real "just watching" footage — no share
  // sheet on screen yet — before the first zoom punch. Beats after that, in
  // capture.mp4 seconds ×30fps: sheet opens 0.55s, View More ~2.6s, expanded
  // + Stash tap ~3.85s, dismiss ~4.1s, note dialog 4.7s on — all offset +52.
  const LEAD = 52;
  const zoomKeyframes = [
    { frame: 0, scale: 1, ...CENTER },
    { frame: LEAD + 8, scale: 1.45, ...SHARE_ICON },
    { frame: LEAD + 16, scale: 1.45, ...SHARE_ICON },
    { frame: LEAD + 28, scale: 1, ...CENTER },
    { frame: LEAD + 66, scale: 1, ...CENTER },
    { frame: LEAD + 76, scale: 1.55, ...VIEW_MORE },
    { frame: LEAD + 90, scale: 1.55, ...VIEW_MORE },
    { frame: LEAD + 100, scale: 1, ...CENTER },
    { frame: LEAD + 108, scale: 1, ...CENTER },
    { frame: LEAD + 116, scale: 1.55, ...STASH_ROW },
    { frame: LEAD + 130, scale: 1.55, ...STASH_ROW },
    { frame: LEAD + 138, scale: 1, ...CENTER },
    { frame: LEAD + 180, scale: 1, ...CENTER },
    { frame: LEAD + 196, scale: 1.35, ...DONE_BUTTON },
    { frame: LEAD + 246, scale: 1.35, ...DONE_BUTTON },
  ];

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AutoZoom keyframes={zoomKeyframes} contentWidth={CONTENT_W} contentHeight={CONTENT_H}>
        <div style={{ width: CONTENT_W, height: CONTENT_H }}>
          <OffthreadVideo
            src={staticFile("capture.mp4")}
            style={{ width: "100%", height: "100%", objectFit: "fill" }}
          />
        </div>
      </AutoZoom>
    </AbsoluteFill>
  );
};
