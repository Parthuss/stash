import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

// Wraps a scene so it fades in on entry and out on exit — Series.Sequence
// gives each child a frame counter relative to its own start, so this needs
// no knowledge of where the scene sits in the overall timeline.
export const SceneFade: React.FC<{
  durationInFrames: number;
  fadeIn?: number;
  fadeOut?: number;
  children: React.ReactNode;
}> = ({ durationInFrames, fadeIn = 10, fadeOut = 10, children }) => {
  const frame = useCurrentFrame();

  // Build strictly-increasing breakpoints — fadeIn/fadeOut of 0 would
  // otherwise duplicate a boundary and interpolate() rejects that.
  const points: { at: number; value: number }[] = [{ at: 0, value: fadeIn > 0 ? 0 : 1 }];
  if (fadeIn > 0) points.push({ at: fadeIn, value: 1 });
  const outStart = durationInFrames - fadeOut;
  if (fadeOut > 0 && outStart > points[points.length - 1].at) {
    points.push({ at: outStart, value: 1 });
    points.push({ at: durationInFrames, value: 0 });
  } else if (points[points.length - 1].at < durationInFrames) {
    points.push({ at: durationInFrames, value: points[points.length - 1].value });
  }

  const opacity = interpolate(
    frame,
    points.map((p) => p.at),
    points.map((p) => p.value),
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};
