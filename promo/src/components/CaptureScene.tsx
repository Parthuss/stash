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
// Centered on the text field, not the Done button — that framing cropped
// "Claude" off the left edge of "Claude motion design" entirely. The field
// spans nearly the full width (measured: content-space x 48-1044 of 1080),
// so there's not much room to zoom in without cropping typed text; this
// prioritizes showing the whole line over a dramatic punch-in.
const NOTE_FIELD = at(284, 218);

export const CaptureScene: React.FC = () => {
  // Leads with 1.75s (52 frames) of real "just watching" footage — no share
  // sheet on screen yet — before the first zoom punch. Real-world anchors
  // (capture.mp4 seconds ×30fps, before the +LEAD shift): sheet opens 0.55s,
  // View More tap ~2.6s, Stash tap ~3.85s, dismiss ~4.1s, note dialog 4.7s.
  //
  // Peak-zoom frames MUST stay pinned near these — iOS dismisses a share
  // sheet in ~8 frames flat, so there's no real content to hold on past
  // that regardless of how long the keyframes say to wait. (First attempt
  // at "slow this down" pushed the Stash-row peak to LEAD+190 without
  // checking this — ended up zoomed on empty reel footage well after the
  // sheet had already closed. Verify with actual frame extraction, not
  // just the keyframe numbers, before trusting a retime here.)
  //
  // What's actually safe to widen: ramp-in/hold/release durations, by
  // borrowing time from the gaps between beats — not the peak positions.
  const LEAD = 52;
  const zoomKeyframes = [
    { frame: 0, scale: 1, ...CENTER },
    { frame: LEAD + 8, scale: 1.45, ...SHARE_ICON }, // ramp 60f (from frame 0)
    { frame: LEAD + 20, scale: 1.45, ...SHARE_ICON }, // hold 12f (was 8f)
    { frame: LEAD + 32, scale: 1, ...CENTER }, // release 12f
    { frame: LEAD + 48, scale: 1, ...CENTER }, // gap 16f
    { frame: LEAD + 76, scale: 1.55, ...VIEW_MORE }, // ramp 28f (was 10f) — peak pinned at real tap (~2.6s)
    { frame: LEAD + 92, scale: 1.55, ...VIEW_MORE }, // hold 16f (was 14f)
    { frame: LEAD + 106, scale: 1, ...CENTER }, // release 14f (was 10f)
    { frame: LEAD + 116, scale: 1.55, ...STASH_ROW }, // ramp 10f (was 8f) — peak pinned at real tap (~3.85s)
    { frame: LEAD + 132, scale: 1.55, ...STASH_ROW }, // hold 16f (was 14f) — brackets the ~4.1s dismiss
    { frame: LEAD + 144, scale: 1, ...CENTER }, // release 12f (was 8f) — settled before the ~4.7s dialog
    { frame: LEAD + 164, scale: 1.15, ...NOTE_FIELD }, // ramp 20f
    { frame: LEAD + 246, scale: 1.15, ...NOTE_FIELD }, // hold 82f (was 50f) to scene end
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
