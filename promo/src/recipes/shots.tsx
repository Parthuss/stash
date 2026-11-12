/**
 * Skwirl shot recipes: camera moves and transitions for reels made from product screenshots.
 * Remotion 4, 30 fps, 1080x1920. Pattern after github.com/Vincentwei1021/video-shotcraft (Apache-2.0);
 * original code, parameters re-derived for vertical.
 *
 * Coordinate system: every rect/point is in CSS px of a 390x844 screen (the 3x captures are 1170 wide).
 * Every camera recipe takes `children` = the screen content (usually <ScreenImg src="recipes/note.png"/>),
 * an optional `overlay` (drawn in the same 390-wide space, moves with the camera) and a `start` frame
 * in the surrounding Sequence's timeline.
 */
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, D, Ground, Mark, Phone, Pill, Tap, ease, prog, ui } from "../launch/kit";

// ---------------------------------------------------------------- geometry
export type Rect = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };

/** Base scale of the phone in a wide shot (phone 424x880 world px -> 763x1584 on the 1080x1920 frame). */
export const BASE = 1.8;
/** CSS px of the screenshot -> phone-inner world px. Phone screen is 400 wide inside a 12px bezel. */
export const K = 400 / 390;
const W = 1080, H = 1920;
/** Default (wide shot) camera centre, CSS px. */
export const CENTER: Pt = { x: 195, y: 422 };

/** Frame of beat n at the given tempo. beats(0,120,30) = 0, beats(1) = 15. */
export const beats = (n: number, bpm = 120, fps = 30) => Math.round((n * 60 * fps) / bpm);

export const centreOf = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Zoom (relative to the wide shot) that frames `r` at `frac` of the frame width/height, clamped to [1, maxZoom]. */
export const zoomFor = (r: Rect, frac = 0.68, maxZoom = 2.8) =>
  Math.max(1, Math.min(maxZoom, (frac * W) / (r.w * K * BASE), (frac * H) / (r.h * K * BASE)));

/** The screenshot as a 390x844 CSS-px layer. */
export const ScreenImg: React.FC<{ src: string }> = ({ src }) => (
  <Img src={staticFile(src)} style={{ width: 390, height: 844, display: "block" }} />
);

// ---------------------------------------------------------------- the rig
type RigProps = {
  cx?: number; cy?: number; zoom?: number; dx?: number; dy?: number;
  /** Gaussian blur in frame px on the whole view (use only while the camera is moving fast). */
  blur?: number; bright?: number; ground?: boolean;
  children: React.ReactNode; overlay?: React.ReactNode;
};

/** Camera: phone-in-frame, looking at (cx, cy) CSS px at `zoom` x the wide shot, shifted by dx/dy frame px. */
export const Rig: React.FC<RigProps> = ({ cx = CENTER.x, cy = CENTER.y, zoom = 1, dx = 0, dy = 0, blur = 0, bright = 1, ground = true, children, overlay }) => {
  const wx = 12 + cx * K, wy = 12 + cy * K, s = BASE * zoom;
  const filter = [blur > 0.4 ? `blur(${blur}px)` : "", bright !== 1 ? `brightness(${bright})` : ""].filter(Boolean).join(" ") || "none";
  return (
    <AbsoluteFill style={{ overflow: "hidden", filter }}>
      {ground ? <Ground /> : null}
      <div style={{ position: "absolute", left: 0, top: 0, width: 424, height: 880, transformOrigin: "0 0", transform: `translate(${W / 2 + dx}px, ${H / 2 + dy}px) scale(${s}) translate(${-wx}px, ${-wy}px)` }}>
        <Phone>
          <div style={{ position: "relative", width: 390, height: 844, transform: `scale(${K})`, transformOrigin: "0 0" }}>
            {children}
            {overlay}
          </div>
        </Phone>
      </div>
    </AbsoluteFill>
  );
};

type ShotProps = { start?: number; children: React.ReactNode; overlay?: React.ReactNode };

// ---------------------------------------------------------------- PushIn
/** Slow push from the wide shot to `rect`. Reads as "look here", not "look at THIS". 45-75 frames. */
export const PushIn: React.FC<ShotProps & { rect: Rect; duration?: number; endScale?: number; frac?: number }> = ({ start = 0, rect, duration = 60, endScale, frac = 0.62, children, overlay }) => {
  const f = useCurrentFrame();
  const t = prog(f, start, start + duration, ease);
  const c = centreOf(rect), z = endScale ?? zoomFor(rect, frac, 2.2);
  return <Rig cx={lerp(CENTER.x, c.x, t)} cy={lerp(CENTER.y, c.y, t)} zoom={lerp(1, z, t)} overlay={overlay}>{children}</Rig>;
};

// ---------------------------------------------------------------- CrashZoom
/**
 * 6-frame punch to `rect`. `bounce` overshoots 4.5% and settles in 5 frames (springy, "look at this");
 * `slam` stops dead and shakes 14px * e^(-t/1.8) (heavy, "that's the one"). Pick one per reel, never mix.
 * Timeline from `start`: 7f pull-back, 6f punch, 5f settle, then a 2% creep so the hold is alive.
 */
export const CrashZoom: React.FC<ShotProps & { rect: Rect; mode?: "bounce" | "slam"; frac?: number; maxZoom?: number }> = ({ start = 0, rect, mode = "bounce", frac = 0.72, maxZoom = 2.8, children, overlay }) => {
  const f = useCurrentFrame();
  const g = f - start, PRE = 7, PUNCH = 6;
  const zEnd = zoomFor(rect, frac, maxZoom), c = centreOf(rect);
  const ov = mode === "bounce" ? 0.045 : 0;
  const pull = interpolate(g, [0, PRE], [1, 0.97], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const p = interpolate(g, [PRE, PRE + PUNCH], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const settle = prog(g, PRE + PUNCH, PRE + PUNCH + 5, Easing.out(Easing.cubic));
  const creep = 1 + 0.02 * prog(g, PRE + PUNCH + 5, PRE + PUNCH + 65, Easing.linear);
  const zoom = (g < PRE ? pull : lerp(0.97, zEnd * (1 + ov), p)) * (g > PRE + PUNCH ? lerp(1, 1 / (1 + ov), settle) : 1) * (g > PRE + PUNCH + 5 ? creep : 1);
  const t = g - (PRE + PUNCH);
  const amp = mode === "slam" && t >= 0 && t < 6 ? 14 * Math.exp(-t / 1.8) : 0;
  const blur = interpolate(g, [PRE, PRE + PUNCH - 1, PRE + PUNCH], [0, 9, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <Rig cx={lerp(CENTER.x, c.x, p)} cy={lerp(CENTER.y, c.y, p)} zoom={zoom} blur={blur}
      dx={amp * Math.sin(g * 12.9898)} dy={amp * Math.cos(g * 78.233)} overlay={overlay}>{children}</Rig>
  );
};

// ---------------------------------------------------------------- FocusRing
const rr = (r: Rect, pad: number, rad: number) => {
  const x = r.x - pad, y = r.y - pad, w = r.w + 2 * pad, h = r.h + 2 * pad;
  return `M${x + rad} ${y}H${x + w - rad}A${rad} ${rad} 0 0 1 ${x + w} ${y + rad}V${y + h - rad}A${rad} ${rad} 0 0 1 ${x + w - rad} ${y + h}H${x + rad}A${rad} ${rad} 0 0 1 ${x} ${y + h - rad}V${y + rad}A${rad} ${rad} 0 0 1 ${x + rad} ${y}Z`;
};

/** Spotlight: dims everything but `rect`, ring draws on, optional label. Includes a gentle push toward the rect. */
export const FocusRing: React.FC<ShotProps & { rect: Rect; label?: string; radius?: number; dim?: number; push?: number; labelAbove?: boolean }> = ({ start = 0, rect, label, radius = 16, dim = 0.5, push = 1.22, labelAbove, children, overlay }) => {
  const f = useCurrentFrame();
  const dimT = prog(f, start, start + 12), ring = prog(f, start + 4, start + 22), lab = prog(f, start + 18, start + 28), mv = prog(f, start, start + 50);
  const c = centreOf(rect), pad = 5;
  const ly = labelAbove ? rect.y - pad - 30 : rect.y + rect.h + pad + 8;
  const layer = (
    <>
      <svg width={390} height={844} style={{ position: "absolute", inset: 0, zIndex: 10 }}>
        <path fillRule="evenodd" d={`M0 0H390V844H0Z ${rr(rect, pad, radius)}`} fill={C.ink} opacity={dim * dimT} />
        <path d={rr(rect, pad, radius)} pathLength={1} fill="none" stroke={C.coral} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1 - ring} />
      </svg>
      {label ? (
        <div style={{ position: "absolute", left: rect.x - pad, top: ly, transform: `translateY(${(1 - lab) * 6}px) scale(.42)`, transformOrigin: "0 0", opacity: lab, zIndex: 11 }}>
          <Pill bg={C.ink} color="#fff">{label}</Pill>
        </div>
      ) : null}
      {overlay}
    </>
  );
  return <Rig cx={lerp(CENTER.x, c.x, mv)} cy={lerp(CENTER.y, c.y, mv)} zoom={lerp(1, push, mv)} overlay={layer}>{children}</Rig>;
};

// ---------------------------------------------------------------- TypeIn
/**
 * Types `text` into a replica of the search field (hides what the screenshot already shows), then reveals the results
 * and taps `tapAt`. `coverSrc` is the same screenshot: a plain stretch of it is used to hide the results until typing ends.
 */
export const TypeIn: React.FC<ShotProps & {
  text: string; coverSrc: string; field?: Rect; results?: Rect; tapAt?: Pt; perChar?: number; zoom?: number; camY?: number;
}> = ({ start = 0, text, coverSrc, field = { x: 14, y: 74, w: 363, h: 61 }, results = { x: 0, y: 130, w: 390, h: 315 }, tapAt = { x: 103, y: 312 }, perChar = 3, zoom = 1.3, camY = 250, children, overlay }) => {
  const f = useCurrentFrame();
  const typeFrom = start + 12, typeEnd = typeFrom + text.length * perChar;
  const n = Math.max(0, Math.min(text.length, Math.floor((f - typeFrom) / perChar)));
  const caretOn = Math.floor((f - start) / 8) % 2 === 0 || (f >= typeFrom && f < typeEnd + 2);
  const reveal = prog(f, typeEnd + 3, typeEnd + 10, Easing.out(Easing.quad));
  const mv = prog(f, start, start + 40);
  const pad = 2;
  const layer = (
    <>
      <div style={{ position: "absolute", left: results.x, top: results.y, width: results.w, height: results.h, overflow: "hidden", opacity: 1 - reveal, zIndex: 5, WebkitMaskImage: "linear-gradient(transparent, #000 14px, #000 calc(100% - 36px), transparent)" }}>
        <Img src={staticFile(coverSrc)} style={{ position: "absolute", left: 0, top: -(results.y + 300), width: 390, height: 844 }} />
      </div>
      <div style={{ position: "absolute", left: field.x - pad, top: field.y - pad, width: field.w + 2 * pad, height: field.h + 2 * pad, borderRadius: 999, background: "#fff", border: `1.6px solid ${C.ink}`, boxSizing: "border-box", zIndex: 6, display: "flex", alignItems: "center", paddingLeft: 24, fontFamily: ui, fontSize: 17, color: C.ink }}>
        <svg width={17} height={17} viewBox="0 0 20 20" style={{ marginRight: 14, flex: "none" }}><circle cx="8.5" cy="8.5" r="6" fill="none" stroke={C.muted} strokeWidth={2} /><path d="M13 13l5 5" stroke={C.muted} strokeWidth={2} strokeLinecap="round" /></svg>
        <span>{text.slice(0, n)}</span>
        <span style={{ width: 1.6, height: 21, marginLeft: 1, background: C.ink, opacity: caretOn ? 1 : 0 }} />
      </div>
      <div style={{ position: "absolute", inset: 0, zIndex: 8, pointerEvents: "none" }}><Tap at={typeEnd + 18} x={tapAt.x} y={tapAt.y} dark size={44} /></div>
      {overlay}
    </>
  );
  return <Rig cx={CENTER.x} cy={lerp(CENTER.y, camY, mv)} zoom={lerp(1, zoom, mv)} overlay={layer}>{children}</Rig>;
};
/** Frame at which TypeIn has finished typing (useful to schedule the next cut). */
export const typeInEnd = (start: number, chars: number, perChar = 3) => start + 12 + chars * perChar;

// ---------------------------------------------------------------- WhipPan
/** Sideways whip between two full-frame scenes. Directional blur only while moving (sd = 0.085 x px/frame, cap 64). */
export const WhipPan: React.FC<{ start: number; from: React.ReactNode; to: React.ReactNode; duration?: number; dir?: "left" | "right"; id?: string }> = ({ start, from, to, duration = 14, dir = "left", id = "whip" }) => {
  const f = useCurrentFrame();
  const curve = Easing.bezier(0.8, 0, 0.15, 1);
  const pos = (fr: number) => curve(Math.min(1, Math.max(0, (fr - start) / duration)));
  const p = pos(f);
  const speed = Math.abs(pos(f) - pos(f - 1)) * W;
  const sd = Math.min(64, 0.085 * speed);
  const sign = dir === "left" ? -1 : 1;
  const filter = sd > 0.6 ? `url(#${id})` : "none";
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id={id} x="-30%" y="0" width="160%" height="100%"><feGaussianBlur stdDeviation={`${sd} 0`} /></filter>
      </svg>
      <AbsoluteFill style={{ transform: `translateX(${sign * p * W}px)`, filter }}>{from}</AbsoluteFill>
      <AbsoluteFill style={{ transform: `translateX(${-sign * (1 - p) * W}px)`, filter }}>{to}</AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- HiddenCut
/**
 * A brand card sweeps left to right over `duration` frames on bezier(.3,0,.7,1); the hard cut happens while it covers
 * the frame (at start + duration/2). `occluder` replaces the default lavender card with the mark.
 */
export const HiddenCut: React.FC<{ start: number; from: React.ReactNode; to: React.ReactNode; duration?: number; color?: string; occluder?: React.ReactNode }> = ({ start, from, to, duration = 14, color = C.lavender, occluder }) => {
  const f = useCurrentFrame();
  const p = Easing.bezier(0.3, 0, 0.7, 1)(Math.min(1, Math.max(0, (f - start) / duration)));
  const PW = 1500, x = lerp(-PW, W, p);
  const cut = start + duration / 2;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {f < cut ? from : to}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: x, width: PW, background: color, borderRadius: "0 260px 260px 0", boxShadow: "20px 0 80px rgb(60 50 120 / .25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {occluder ?? <Mark size={300} id="hc-mark" />}
      </div>
    </AbsoluteFill>
  );
};
export const hiddenCutFrame = (start: number, duration = 14) => start + duration / 2;

// ---------------------------------------------------------------- BeatPunch
/**
 * Jump-cut punch-in on the beat: wide -> 1.6x at beats[0] -> 2.6x at beats[1], hard cuts, 2-frame brightness 0.92 tick.
 * Frames are in the surrounding Sequence. Hold the last step >= 35 frames. `focus` = target point per step, CSS px.
 */
export const BeatPunch: React.FC<ShotProps & { beats: [number, number]; focus: [Pt, Pt]; scales?: [number, number] }> = ({ beats: b, focus, scales = [1.6, 2.6], children, overlay }) => {
  const f = useCurrentFrame();
  const step = f >= b[1] ? 2 : f >= b[0] ? 1 : 0;
  const tick = step > 0 && f < b[step - 1] + 2;
  const pt = step === 0 ? CENTER : focus[step - 1];
  return <Rig cx={pt.x} cy={pt.y} zoom={step === 0 ? 1 : scales[step - 1]} bright={tick ? 0.92 : 1} overlay={overlay}>{children}</Rig>;
};

// ---------------------------------------------------------------- Parallax
export type ParallaxLayer = { node: React.ReactNode; speed: number; blur?: number; sat?: number };
/** 2-4 full-frame layers converge to rest, each travelling `travel x speed` px; the last layer is the hero and lifts at the end. */
export const Parallax: React.FC<{ start?: number; duration?: number; travel?: number; layers: ParallaxLayer[] }> = ({ start = 0, duration = 45, travel = 480, layers }) => {
  const f = useCurrentFrame();
  const t = prog(f, start, start + duration, Easing.bezier(0.2, 0.6, 0.2, 1));
  const lift = prog(f, start + duration - 12, start + duration + 3, ease);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Ground />
      {layers.map((l, i) => {
        const hero = i === layers.length - 1;
        const filter = [l.blur ? `blur(${l.blur}px)` : "", l.sat != null ? `saturate(${l.sat})` : "", hero ? `drop-shadow(0 ${24 * lift}px ${40 * lift}px rgb(60 50 120 / ${0.25 * lift}))` : ""].filter(Boolean).join(" ") || "none";
        const y = (1 - t) * travel * l.speed - (hero ? 18 * lift : 0);
        return <AbsoluteFill key={i} style={{ transform: `translateY(${y}px) scale(${hero ? 1 + 0.05 * lift : 1})`, filter }}>{l.node}</AbsoluteFill>;
      })}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- FlashCut
/** White flash starting on the cut frame `at`: 0.95 -> 0 over `frames` (default 4). Cover a hard cut only, never decoration. */
export const FlashCut: React.FC<{ at: number; frames?: number }> = ({ at, frames = 4 }) => {
  const g = useCurrentFrame() - at;
  if (g < 0 || g >= frames) return null;
  return <AbsoluteFill style={{ background: "#fff", opacity: 0.95 * Math.pow(1 - g / frames, 2), zIndex: 99 }} />;
};

export { C, D };
