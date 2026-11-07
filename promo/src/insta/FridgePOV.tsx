// Piece 5, faceless cut: "11:40pm. Fridge open." 1080×1920, 10.5s, loops (ends on black = starts on black).
// Pain (endless Saved scroll) → the app fixes it on screen within ~2s → logo. No voice: the trending
// sound is added in the Instagram app when posting.
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, D, lift, Mark, Phone, prog, ui } from "../launch/kit";

const T = { fridge: 0, scroll: 66, find: 180, note: 258, end: 315 };

const Caption: React.FC<{ children: React.ReactNode; from: number; to: number; dark?: boolean; size?: number }> = ({ children, from, to, dark, size = 76 }) => {
  const f = useCurrentFrame();
  const i = prog(f, from, from + 8), o = prog(f, to - 6, to);
  if (f < from || f > to) return null;
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top: 250, textAlign: "center", ...D, fontSize: size, lineHeight: 1.08, letterSpacing: -0.5,
      color: dark ? "#fff" : C.ink, opacity: i * (1 - o), transform: `translateY(${(1 - i) * 18}px)`, textShadow: dark ? "0 4px 30px rgb(0 0 0 / .5)" : undefined }}>
      {children}
    </div>
  );
};

// Warm fridge light in a dark kitchen. The glow stays faintly behind the phone afterwards.
const Fridge: React.FC = () => {
  const f = useCurrentFrame();
  const open = prog(f, 4, 26, Easing.out(Easing.cubic));
  const away = prog(f, T.scroll - 4, T.scroll + 18);
  return (
    <AbsoluteFill style={{ background: "#0c0b12" }}>
      <AbsoluteFill style={{ background: `radial-gradient(55% 45% at 50% 62%, rgb(255 236 196 / ${0.55 * open}), transparent 70%)` }} />
      <div style={{ position: "absolute", left: 250, top: 640, width: 580, height: 980, borderRadius: 30, background: "#fffaf0", opacity: open * (1 - away * 0.85),
        boxShadow: `0 0 ${160 * open}px rgb(255 240 210 / .8)`, transform: `perspective(1400px) rotateY(${(1 - open) * -70}deg)`, transformOrigin: "left center", overflow: "hidden" }}>
        {[240, 500, 760].map((y) => <div key={y} style={{ position: "absolute", left: 30, right: 30, top: y, height: 10, borderRadius: 5, background: "#e9e2d2" }} />)}
        <div style={{ position: "absolute", top: 150, left: 70, fontSize: 140 }}>🥚</div>
        <div style={{ position: "absolute", top: 400, left: 300, fontSize: 140 }}>🧈</div>
        <div style={{ position: "absolute", top: 660, left: 120, fontSize: 140 }}>🧀</div>
      </div>
    </AbsoluteFill>
  );
};

const GRID = ["🏋️", "😂", "🏋️", "🐶", "🏋️", "💪", "😂", "🏋️", "✈️", "🏋️", "🧘", "😂", "🏋️", "💪", "🎧", "🏋️", "😂", "🏋️"];
const TINTS = [C.lavender, C.peach, C.mint, C.sky, C.butter];
const SavedScroll: React.FC = () => {
  const f = useCurrentFrame();
  const speed = interpolate(f, [T.scroll, T.scroll + 20, T.find - 25, T.find], [0, 46, 46, 8], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  let y = 0; for (let k = T.scroll; k < f; k++) y += interpolate(k, [T.scroll, T.scroll + 20, T.find - 25, T.find], [0, 46, 46, 8], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 140, paddingTop: 78, boxSizing: "border-box", textAlign: "center", fontWeight: 700, fontSize: 32, color: "#111", zIndex: 2, background: "#fff" }}>Saved</div>
      <div style={{ position: "absolute", top: 140, left: 4, right: 4, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, transform: `translateY(${-(y % 1800)}px)`, filter: `blur(${Math.min(speed / 12, 3)}px)` }}>
        {Array.from({ length: 90 }, (_, i) => (
          <div key={i} style={{ aspectRatio: "9 / 16", background: `linear-gradient(160deg, ${TINTS[i % 5]}, #fff)`, display: "grid", placeItems: "center", fontSize: 64 }}>{GRID[i % GRID.length]}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const Find: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const word = "pasta";
  const typed = word.slice(0, Math.max(0, Math.min(word.length, Math.floor((f - (T.find + 14)) / 4))));
  const pop = spring({ frame: f - (T.find + 40), fps, config: { damping: 13, stiffness: 160 } });
  return (
    <AbsoluteFill style={{ background: C.bg, padding: "92px 30px 0", fontFamily: ui }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, ...D, fontSize: 44, color: C.ink }}><Mark size={46} id="fp" />Skwirl</div>
      <div style={{ marginTop: 26, height: 84, borderRadius: 999, background: "#fff", boxShadow: lift, display: "flex", alignItems: "center", padding: "0 30px", fontSize: 32, color: typed ? C.ink : C.muted }}>
        🔍&nbsp;&nbsp;{typed || "Search your saves"}<span style={{ width: 3, height: 38, background: C.ink, marginLeft: 3, opacity: Math.floor(f / 8) % 2 }} />
      </div>
      <div style={{ marginTop: 34, width: "100%", borderRadius: 36, overflow: "hidden", background: "#fff", boxShadow: lift, opacity: pop, transform: `scale(${0.7 + 0.3 * pop})`, transformOrigin: "top center" }}>
        <div style={{ height: 440, background: `linear-gradient(160deg, ${C.peach}, ${C.butter})`, display: "grid", placeItems: "center", fontSize: 150, position: "relative" }}>
          🍝🧄<span style={{ position: "absolute", left: 16, top: 16, fontSize: 22, fontWeight: 500, padding: "6px 14px", borderRadius: 999, background: C.peach, color: C.peachInk }}>Unused</span>
        </div>
        <div style={{ padding: "18px 22px 24px" }}>
          <div style={{ fontWeight: 600, fontSize: 40, lineHeight: 1.2, color: C.ink }}>Garlic butter pasta in 15 minutes</div>
          <div style={{ fontSize: 28, color: C.muted, marginTop: 10 }}>Food · saved 3 months ago</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const FridgePOV: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: f - (T.scroll - 6), fps, config: { damping: 16, stiffness: 120 } });
  const toFind = prog(f, T.find - 3, T.find + 5), toNote = prog(f, T.note - 4, T.note + 8);
  const fadeOut = prog(f, T.end - 9, T.end);
  const outro = prog(f, T.note + 14, T.note + 26);
  return (
    <AbsoluteFill style={{ background: "#0c0b12" }}>
      <Fridge />
      {f >= T.scroll - 6 && (
        <div style={{ position: "absolute", left: (1080 - 640) / 2, top: 560 + (1 - rise) * 1400 - outro * 60, transform: `scale(${1 - outro * 0.06})` }}>
          <Phone w={640} h={1300}>
            <AbsoluteFill style={{ opacity: 1 - toFind }}><SavedScroll /></AbsoluteFill>
            <AbsoluteFill style={{ opacity: toFind * (1 - toNote) }}><Find /></AbsoluteFill>
            <AbsoluteFill style={{ opacity: toNote, background: C.bg }}><Img src={staticFile("insta/note-full.png")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} /></AbsoluteFill>
          </Phone>
        </div>
      )}
      <Caption from={8} to={T.scroll - 2} dark>11:40pm.<br />I know I saved a pasta recipe.</Caption>
      <Caption from={T.scroll + 10} to={T.find - 2} dark>Scrolling past 400 gym reels</Caption>
      <Caption from={T.find + 4} to={T.find + 36} dark size={110}>…</Caption>
      <Caption from={T.find + 42} to={T.note + 10} dark size={140}>oh.</Caption>
      <Caption from={T.note + 16} to={T.end} dark size={84}>Skwirl. Free.<br />Link in bio.</Caption>
      <AbsoluteFill style={{ background: "#0c0b12", opacity: fadeOut }} />
    </AbsoluteFill>
  );
};
