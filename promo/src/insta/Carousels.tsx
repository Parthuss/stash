// Instagram carousels (1080×1350 stills). Piece 3: "Your Saved folder is a graveyard".
// Render: npx remotion still src/insta/index.ts C3-1 out/instagram/03-graveyard/01.png
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, D, Ground, lift, Mark, ui } from "../launch/kit";

const TILES = ["🍝", "📚", "✈️", "🎬", "💸", "🧘", "☕", "🎧", "📍", "🧁", "🏋️", "🪴", "🍜", "🎨", "🛍️", "📸"];
const TINTS = [C.butter, C.lavender, C.sky, C.peach, C.mint];

const Slide: React.FC<{ n: number; headline: React.ReactNode; body?: string; dark?: boolean; size?: number; children?: React.ReactNode }> = ({ n, headline, body, dark, size = 96, children }) => {
  const ink = dark ? "#fff" : C.ink;
  return (
    <AbsoluteFill>
      <Ground />
      <div style={{ position: "absolute", left: 70, top: 70, width: 940, height: 1210, borderRadius: 56, background: dark ? C.ink : "rgb(255 255 255 / .72)", boxShadow: lift, overflow: "hidden", display: "flex", flexDirection: "column", padding: "84px 72px 0" }}>
        {dark && !children ? <div style={{ flex: 1 }} /> : null}
        <div style={{ ...D, fontSize: size, lineHeight: 1.04, letterSpacing: -1, color: ink }}>{headline}</div>
        {body ? <div style={{ fontFamily: ui, fontSize: 40, lineHeight: 1.35, color: dark ? "rgb(255 255 255 / .78)" : "rgb(29 27 46 / .78)", marginTop: 30 }}>{body}</div> : null}
        <div style={{ flex: 1, position: "relative", display: "grid", placeItems: "center" }}>{children}</div>
        <div style={{ height: 120, display: "flex", alignItems: "center", gap: 14, fontFamily: ui, fontWeight: 600, fontSize: 36, color: ink }}>
          <span style={{ filter: dark ? "invert(1) hue-rotate(180deg)" : undefined, display: "inline-flex" }}><Mark size={56} id={`m${n}`} /></span>Skwirl
          <span style={{ marginLeft: "auto", fontWeight: 400, fontSize: 30, color: dark ? "rgb(255 255 255 / .55)" : C.muted }}>{n}/8</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Tile: React.FC<{ e: string; i: number; w: number; dead?: boolean; label?: string }> = ({ e, i, w, dead, label }) => (
  <div style={{ width: w, aspectRatio: "9 / 16", borderRadius: w * 0.12, background: `linear-gradient(160deg, ${TINTS[i % 5]}, #fff)`, boxShadow: lift, display: "grid", placeItems: "center", fontSize: w * 0.42, position: "relative", filter: dead ? "grayscale(1)" : undefined, opacity: dead ? 0.72 : 1 }}>
    {e}
    <span style={{ position: "absolute", left: w * 0.08, bottom: w * 0.07, fontFamily: ui, fontWeight: 600, fontSize: w * 0.1, color: C.muted }}>{label ?? "▶ Reel"}</span>
    <span style={{ position: "absolute", right: w * 0.08, top: w * 0.07, width: w * 0.09, height: w * 0.11, background: C.ink, clipPath: "polygon(0 0,100% 0,100% 100%,50% 72%,0 100%)", opacity: 0.75 }} />
  </div>
);

const Shot: React.FC<{ src: string; w: number; h: number; pos?: string; style?: React.CSSProperties }> = ({ src, w, h, pos = "top", style }) => (
  <div style={{ width: w, height: h, borderRadius: 36, overflow: "hidden", boxShadow: lift, background: "#fff", ...style }}>
    <Img src={staticFile(`insta/${src}`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: pos }} />
  </div>
);

export const C3_1: React.FC = () => (
  <Slide n={1} size={118} headline={<>Your Saved folder is a graveyard.</>}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 150px)", gap: 22, transform: "rotate(-4deg)" }}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} style={{ position: "relative" }}>
          <Tile e={TILES[(i * 5) % TILES.length]} i={i} w={150} dead />
          {[1, 4, 6].includes(i) ? <span style={{ position: "absolute", right: -14, bottom: -14, fontSize: 64 }}>🪦</span> : null}
        </div>
      ))}
    </div>
  </Slide>
);
export const C3_2: React.FC = () => (
  <Slide n={2} headline="The pasta you saved in March." body="Still haven't made it. Can't find it either.">
    <Tile e="🍝" i={0} w={300} label="Saved 8 months ago" />
  </Slide>
);
const BOOKS = [[C.lavender, 64, 420], [C.peach, 52, 380], [C.mint, 72, 440], [C.butter, 56, 400], [C.sky, 60, 360]] as const;
export const C3_3: React.FC = () => (
  <Slide n={3} headline={<>The 5 books "that changed my life".</>} body="You remember there were five. You remember zero titles.">
    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, paddingBottom: 30, borderBottom: `10px solid ${C.ink}`, borderRadius: 4 }}>
      {BOOKS.map(([c, w, h], i) => (
        <div key={i} style={{ width: w * 1.5, height: h, background: c, borderRadius: 14, boxShadow: lift, display: "grid", placeItems: "center", transform: i === 4 ? "rotate(-8deg) translateX(10px)" : undefined, transformOrigin: "bottom left" }}>
          <span style={{ ...D, fontSize: 64, color: "rgb(29 27 46 / .35)" }}>?</span>
        </div>
      ))}
    </div>
  </Slide>
);
export const C3_4: React.FC = () => (
  <Slide n={4} headline="That café in Tokyo." body="Somewhere between a gym reel and a meme.">
    <div style={{ display: "flex", gap: 26, alignItems: "center" }}>
      <Tile e="🏋️" i={4} w={200} dead /><Tile e="📍" i={2} w={260} label="☕ Tokyo" /><Tile e="😂" i={3} w={200} dead />
    </div>
  </Slide>
);
export const C3_5: React.FC = () => (
  <Slide n={5} dark size={150} headline={<>Saving feels like doing.</>} body="It isn't. It's a bookmark you'll never open." />
);
export const C3_6: React.FC = () => (
  <Slide n={6} headline="What if every save came back as a note?">
    <Shot src="note.png" w={620} h={620} />
  </Slide>
);
export const C3_7: React.FC = () => (
  <Slide n={7} size={88} headline="Recipes become steps. Books land in a list.">
    <div style={{ position: "relative", width: 800, height: 640 }}>
      <Shot src="note-full.png" w={420} h={600} pos="50% 55%" style={{ position: "absolute", left: 0, top: 20, transform: "rotate(-4deg)" }} />
      <Shot src="lists.png" w={420} h={600} style={{ position: "absolute", right: 0, top: 0, transform: "rotate(4deg)" }} />
    </div>
  </Slide>
);
export const C3_8: React.FC = () => (
  <Slide n={8} size={110} headline={<>Skwirl.<br />Free. Link in bio.</>} body="Send this to the friend with 900 saved recipes.">
    <Mark size={260} id="big8" />
  </Slide>
);
