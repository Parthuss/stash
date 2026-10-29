import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { loadFont as loadGloock } from "@remotion/google-fonts/Gloock";
import { loadFont as loadFamiljen } from "@remotion/google-fonts/FamiljenGrotesk";
import { ACORN, CENTRELINE, CENTRELINE_LENGTH, MAX_WIDTH, TAIL } from "./markGeometry";

export const display = loadGloock().fontFamily;
export const ui = loadFamiljen("normal", { weights: ["400", "500", "600"] }).fontFamily;

// The app's own tokens (worker/public/index.html :root).
export const C = {
  bg: "#f8f7ff", ink: "#1d1b2e", muted: "#6a6880", line: "#ebe8f7",
  lavender: "#dcd8ff", mint: "#cdf3e1", peach: "#ffd8cb", sky: "#d6ebff", butter: "#fff0c4",
  coral: "#ff7a59", peachInk: "#8a3b1f",
};
export const lift = "0 4px 10px rgb(60 50 120 / .08), 0 18px 40px rgb(60 50 120 / .12)";
export const ease = Easing.bezier(0.2, 0.7, 0.2, 1);

/** 0→1 over [a, b] with the house easing, clamped. */
export const prog = (f: number, a: number, b: number, e = ease) =>
  interpolate(f, [a, b], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: e });

/** Fade + lift in at `inAt`, out at `outAt` (old content leaves before new arrives). */
export const useInOut = (inAt: number, outAt: number, dist = 24) => {
  const f = useCurrentFrame();
  const i = prog(f, inAt, inAt + 12), o = prog(f, outAt, outAt + 9, Easing.in(Easing.cubic));
  return { opacity: i * (1 - o), transform: `translateY(${(1 - i) * dist - o * dist}px)` };
};

// Ambient lavender/peach orbs, the landing page's ground, drifting as a pure function of time.
export const Ground: React.FC = () => {
  const f = useCurrentFrame();
  const a = Math.sin(f / 70), b = Math.cos(f / 85);
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1300, height: 1300, borderRadius: "50%", background: "#d9d3ff", filter: "blur(140px)", opacity: 0.8, left: -420 + a * 60, top: -620 + b * 50 }} />
      <div style={{ position: "absolute", width: 1100, height: 1100, borderRadius: "50%", background: "#ffdbd0", filter: "blur(140px)", opacity: 0.85, right: -380 - b * 60, bottom: -560 - a * 40 }} />
    </AbsoluteFill>
  );
};

/** Words appear as the voice says them (whisper word timestamps), rising out of a soft blur. */
export const Kinetic: React.FC<{
  captions: Caption[]; voAt: number; style?: React.CSSProperties; skip?: number; breakAfter?: number[]; lead?: number;
}> = ({ captions, voAt, style, skip = 0, breakAfter = [], lead = 4 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ fontFamily: display, color: C.ink, letterSpacing: "-0.03em", lineHeight: 1.04, ...style }}>
      {captions.slice(skip).map((c, i) => {
        const at = voAt + (c.startMs / 1000) * fps - lead;
        const s = spring({ frame: f - at, fps, config: { damping: 18, stiffness: 160 } });
        const word = c.text.trim();
        return (
          <React.Fragment key={i}>
            <span style={{ display: "inline-block", opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 0.45}em)`, filter: `blur(${(1 - Math.min(1, s)) * 10}px)`, marginRight: "0.24em" }}>{word}</span>
            {breakAfter.includes(i + skip) ? <br /> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/** The Skwirl mark. `draw` 0→1 sweeps the tail along its own centreline; `acorn` 0→1 drops the acorn in. */
export const Mark: React.FC<{ size: number; draw?: number; acorn?: number; id: string }> = ({ size, draw = 1, acorn = 1, id }) => (
  <svg viewBox="0 0 100 100" width={size} height={size} style={{ overflow: "visible" }}>
    <defs>
      <mask id={id} maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">
        <path d={CENTRELINE} fill="none" stroke="#fff" strokeWidth={MAX_WIDTH * 1.35} strokeLinecap="round"
          strokeDasharray={CENTRELINE_LENGTH + 2} strokeDashoffset={(1 - draw) * (CENTRELINE_LENGTH + 2)} />
      </mask>
    </defs>
    <path d={TAIL} fill={C.ink} mask={draw < 1 ? `url(#${id})` : undefined} />
    <circle cx={ACORN.cx} cy={ACORN.cy - (1 - acorn) * 26} r={ACORN.r * Math.min(1, acorn * 1.15)} fill={C.coral} opacity={acorn > 0 ? 1 : 0} />
  </svg>
);

/** iPhone-ish frame. Children render inside the screen. */
export const Phone: React.FC<{ children: React.ReactNode; w?: number; h?: number }> = ({ children, w = 424, h = 880 }) => (
  <div style={{ width: w, height: h, borderRadius: 66, background: "#15131f", padding: 12, boxShadow: "0 50px 100px rgb(60 50 120 / .30), inset 0 0 0 2px #2b2838", position: "relative" }}>
    <div style={{ position: "absolute", top: 26, left: "50%", width: 116, height: 34, marginLeft: -58, borderRadius: 20, background: "#000", zIndex: 20 }} />
    <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 54, overflow: "hidden", background: C.bg, fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif" }}>
      {children}
    </div>
  </div>
);

/** Expanding tap ring, centred on its parent's positioned box. */
export const Tap: React.FC<{ at: number; x: number; y: number; dark?: boolean; size?: number }> = ({ at, x, y, dark, size = 64 }) => {
  const f = useCurrentFrame();
  const t = prog(f, at - 4, at + 10, Easing.out(Easing.quad));
  if (f < at - 4 || f > at + 12) return null;
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: "50%", border: `3px solid ${dark ? C.ink : "#fff"}`, background: dark ? "rgb(29 27 46 / .12)" : "rgb(255 255 255 / .3)", transform: `scale(${0.6 + t * 0.7})`, opacity: 1 - prog(f, at + 3, at + 12), zIndex: 30 }} />
  );
};

export const Pill: React.FC<{ children: React.ReactNode; bg?: string; color?: string; style?: React.CSSProperties }> = ({ children, bg = "rgb(255 255 255 / .85)", color = C.ink, style }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 10, height: 56, padding: "0 24px", borderRadius: 999, background: bg, color, fontFamily: ui, fontWeight: 600, fontSize: 26, boxShadow: "0 1px 2px rgb(60 50 120 / .05), 0 6px 18px rgb(60 50 120 / .07)", whiteSpace: "nowrap", ...style }}>{children}</span>
);
