import React from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export type ZoomKeyframe = { frame: number; scale: number; cx: number; cy: number };

// Punches the camera in on a specific point and keeps it centered as scale
// changes — true "auto-zoom" behavior, not just an anchored transform-origin
// (which pushes off-target content past the frame edge when the focal point
// isn't already near center). cx/cy are the focal point in the child's own
// px space; translate is solved so that point lands at the viewport center.
export const AutoZoom: React.FC<{
  keyframes: ZoomKeyframe[];
  clamp?: boolean;
  // Size of the child in its own px space. Defaults to the composition size;
  // pass the real dimensions when the child is bigger than the frame (e.g. a
  // tall video that pans), or the clamp bounds it against the wrong box and
  // refuses to reach focal points that are actually reachable.
  contentWidth?: number;
  contentHeight?: number;
  children: React.ReactNode;
}> = ({ keyframes, clamp = true, contentWidth, contentHeight, children }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const frames = keyframes.map((k) => k.frame);
  const easing = Easing.inOut(Easing.cubic);
  const opts = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing };

  const scale = interpolate(frame, frames, keyframes.map((k) => k.scale), opts);
  const rawCx = interpolate(frame, frames, keyframes.map((k) => k.cx), opts);
  const rawCy = interpolate(frame, frames, keyframes.map((k) => k.cy), opts);

  // Clamp the focal point to what's actually reachable at this scale without
  // the recentered window exposing an edge of the (finite, exactly
  // viewport-sized) source content — a focal point near a corner otherwise
  // pulls a black bar into frame on the opposite side once scale grows.
  const boundsW = contentWidth ?? width;
  const boundsH = contentHeight ?? height;
  const halfW = width / (2 * scale);
  const halfH = height / (2 * scale);
  const cx = clamp ? Math.min(Math.max(rawCx, halfW), boundsW - halfW) : rawCx;
  const cy = clamp ? Math.min(Math.max(rawCy, halfH), boundsH - halfH) : rawCy;

  const tx = width / 2 - cx * scale;
  const ty = height / 2 - cy * scale;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        transformOrigin: "0 0",
      }}
    >
      {children}
    </div>
  );
};
