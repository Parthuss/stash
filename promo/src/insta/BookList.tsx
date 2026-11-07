// Piece 7: "40 book reels. 0 books read." 1080×1920, ~31.7s. Script + evaluation: promo/scripts/07-booklist.md.
// Hook (a Books collection laid out like Instagram's Saved, filling to 40) → pain (blank spines, "?") →
// the music DROPS on the turn: the reels fly into the Skwirl mark and come out as titles → the real
// "Your lists" screen fills one row per beat → tick one off → "Skwirl." [pause] promise → loops through black.
// Music: Sascha Ende "Happy Beats / Business Moves Vol. 1" (CC BY 4.0) placed so its 48.02s downbeat is the drop.
import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { C, D, Ground, Kinetic, lift, Mark, Phone, prog, Tap, ui } from "../launch/kit";
import { BottomNav, Header, Ico, I, sfx, StatusBar, SYS, vo } from "./FridgePOV";
import b1 from "./captions/b-1.json";
import b2 from "./captions/b-2.json";
import b3 from "./captions/b-3.json";
import b4 from "./captions/b-4.json";
import b5 from "./captions/b-5.json";
import b6b from "./captions/b-6b.json";

export const BT = { pain: 105, drop: 240, lists: 360, books: 585, tick: 630, cta: 720, end: 950 };
const VO = { b1: 8, b2: 125, b3: 255, b4: 380, b5: 600, b6a: 735, b6b: 780 };
// Music ducks under the voice (v1 had it level with the VO after the drop, ~-24 LUFS each).
// Spans come from the caption files, so they follow any VO regeneration; b-6a is one short word.
const DUCK_TO = 0.11, RAMP = 6;
const SPANS: [number, number][] = ([[VO.b1, b1], [VO.b2, b2], [VO.b3, b3], [VO.b4, b4], [VO.b5, b5], [VO.b6a, [{ endMs: 600 }]], [VO.b6b, b6b]] as [number, { endMs: number }[]][])
  .map(([at, cap]) => [at, at + Math.ceil((cap[cap.length - 1].endMs / 1000) * 30)]);
const duck = (fr: number) => Math.max(...SPANS.map(([a, b]) => interpolate(fr, [a - RAMP, a, b, b + RAMP], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
const ROW_AT = [375, 390, 405, 420, 435, 450, 465];
const NIGHT = "#15131f";
const TINTS = [C.lavender, C.peach, C.mint, C.sky, C.butter];
const K = (c: unknown) => c as Caption[];

type Item = { title: string; by: string; kind: "Book" | "Movie" | "Place"; from: string; cover: string; ink: string };
const ITEMS: Item[] = [
  { title: "Deep Work", by: "Cal Newport", kind: "Book", from: "5 books that changed how I think", cover: "#1d1b2e", ink: "#fff" },
  { title: "The Psychology of Money", by: "Morgan Housel", kind: "Book", from: "5 books that changed how I think", cover: "#e9f1ff", ink: "#1d1b2e" },
  { title: "Four Thousand Weeks", by: "Oliver Burkeman", kind: "Book", from: "Books for when you feel behind", cover: "#ff7a59", ink: "#fff" },
  { title: "Atomic Habits", by: "James Clear", kind: "Book", from: "3 books every 20-something needs", cover: "#fff0c4", ink: "#1d1b2e" },
  { title: "Perfect Days", by: "Wim Wenders", kind: "Movie", from: "5 slow movies worth the patience", cover: "#cdf3e1", ink: "#1d1b2e" },
  { title: "Past Lives", by: "Celine Song", kind: "Movie", from: "Movies that wreck you (nicely)", cover: "#dcd8ff", ink: "#1d1b2e" },
  { title: "Senso-ji, Asakusa", by: "Tokyo", kind: "Place", from: "Tokyo in 3 days on a budget", cover: "#ffd8cb", ink: "#1d1b2e" },
];
const ICON = { Book: "📚", Movie: "🎬🍿", Place: "🗼🍜" } as const;
const ASK = { Book: "Read?", Movie: "Watched?", Place: "Been?" } as const;

// A drawn cover in our style (no real cover art): colour block, title, author.
const Cover: React.FC<{ it: Item; w: number }> = ({ it, w }) => (
  <div style={{ width: w, height: w * 1.5, borderRadius: w * 0.06, background: it.cover, color: it.ink, boxShadow: lift, padding: w * 0.1, boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid rgb(29 27 46 / .08)" }}>
    <div style={{ ...D, fontSize: w * 0.15, lineHeight: 1.02 }}>{it.title}</div>
    <div style={{ fontFamily: ui, fontSize: w * 0.075, opacity: 0.75 }}>{it.kind === "Book" ? it.by : it.kind === "Movie" ? `🎬 ${it.by}` : `📍 ${it.by}`}</div>
  </div>
);

// ---------- 1. a Books collection, laid out like Instagram's Saved ----------
const BOOK_TILES = ["📚", "📖", "📕", "📗", "📘", "📙"];
const BooksSaved: React.FC = () => {
  const f = useCurrentFrame();
  const n = Math.min(40, Math.floor(prog(f, 6, 96, Easing.out(Easing.quad)) * 40));
  const grey = prog(f, BT.pain, BT.pain + 15);
  return (
    <AbsoluteFill style={{ background: "#fff", fontFamily: SYS }}>
      <div style={{ position: "absolute", top: 140, left: 0, right: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, filter: `grayscale(${grey}) opacity(${1 - grey * 0.35})` }}>
        {Array.from({ length: 15 }, (_, i) => {
          const on = i < n;
          return (
            <div key={i} style={{ aspectRatio: "3 / 4", background: `linear-gradient(160deg, ${TINTS[i % 5]}, #fff)`, display: "grid", placeItems: "center", fontSize: 66, position: "relative", opacity: on ? 1 : 0, transform: on ? "none" : "scale(.8)" }}>
              {BOOK_TILES[i % BOOK_TILES.length]}
              <span style={{ position: "absolute", top: 10, right: 10 }}><Ico d={I.reels} size={28} stroke="#fff" w={2.6} /></span>
              <span style={{ position: "absolute", left: 10, right: 10, bottom: 10, fontSize: 19, fontWeight: 700, color: "#fff", textShadow: "0 1px 4px rgb(0 0 0 / .5)", lineHeight: 1.15 }}>{["5 books that changed my life", "read these in your 20s", "books that rewired my brain", "my 2026 reading list"][i % 4]}</span>
            </div>
          );
        })}
      </div>
      <Header title="Books 📚" />
      <div style={{ position: "absolute", right: 20, top: 156, zIndex: 6, padding: "10px 18px", borderRadius: 999, background: "rgb(0 0 0 / .78)", color: "#fff", fontWeight: 700, fontSize: 26, fontVariantNumeric: "tabular-nums" }}>{n} saved</div>
      <BottomNav />
      <StatusBar />
    </AbsoluteFill>
  );
};

// ---------- 4/5. the real "Your lists" screen ----------
const ListsScreen: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const booksOnly = f >= BT.books + 4;
  const shown = ITEMS.map((it, i) => ({ it, i })).filter(({ it }) => !booksOnly || it.kind === "Book");
  const read = prog(f, BT.tick + 2, BT.tick + 10, Easing.out(Easing.back(2.2)));
  return (
    <AbsoluteFill style={{ background: "linear-gradient(170deg, #ebe8ff, #f8f7ff 40%, #fff1ec)", fontFamily: ui, padding: "84px 26px 0" }}>
      <div style={{ display: "inline-flex", alignSelf: "flex-start", height: 58, padding: "0 24px", borderRadius: 999, background: C.ink, color: "#fff", fontWeight: 600, fontSize: 24, alignItems: "center", width: "fit-content" }}>← Back</div>
      <div style={{ ...D, fontSize: 66, color: C.ink, marginTop: 22 }}>Your lists</div>
      <div style={{ fontSize: 23, color: C.muted, lineHeight: 1.35, marginTop: 8 }}>Every book, movie, show, place and podcast your saves have named, in one place.</div>
      <div style={{ display: "flex", gap: 10, marginTop: 22, position: "relative" }}>
        {["All", "Books", "Movies", "Places"].map((c) => {
          const on = booksOnly ? c === "Books" : c === "All";
          return <span key={c} style={{ height: 52, padding: "0 22px", borderRadius: 999, display: "inline-flex", alignItems: "center", fontSize: 24, fontWeight: 600, background: on ? C.ink : "rgb(255 255 255 / .85)", color: on ? "#fff" : C.muted, boxShadow: on ? "none" : "0 1px 2px rgb(60 50 120 / .06)" }}>{c}</span>;
        })}
        <Tap at={BT.books} x={160} y={26} dark size={90} />
      </div>
      <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
        {shown.map(({ it, i }, k) => {
          const s = spring({ frame: f - ROW_AT[i], fps, config: { damping: 14, stiffness: 170 } });
          const done = it.title === "Atomic Habits" && f >= BT.tick + 2;
          return (
            <div key={it.title} style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", borderRadius: 24, padding: "14px 16px", boxShadow: "0 1px 2px rgb(60 50 120 / .05), 0 6px 18px rgb(60 50 120 / .07)",
              opacity: booksOnly ? 1 : Math.min(1, s * 1.4), transform: booksOnly ? `translateY(${(1 - prog(f, BT.books + 4, BT.books + 14)) * 20 * k}px)` : `translateY(${(1 - s) * -60}px) scale(${0.92 + 0.08 * s})` }}>
              <span style={{ width: 62, height: 62, borderRadius: "50%", background: TINTS[i % 5], display: "grid", placeItems: "center", fontSize: it.kind === "Book" ? 32 : 24, flex: "none" }}>{ICON[it.kind]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 27, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
                <div style={{ fontSize: 20, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.kind} · {it.from}</div>
              </div>
              <span style={{ position: "relative", flex: "none", height: 52, padding: "0 20px", borderRadius: 999, display: "inline-flex", alignItems: "center", fontSize: 22, fontWeight: 600,
                background: done ? C.ink : "#fff", color: done ? "#fff" : C.ink, border: `2px solid ${done ? C.ink : "#e3dffa"}`, transform: done ? `scale(${1 + Math.sin(read * Math.PI) * 0.18})` : undefined }}>
                {done ? "Read ✓" : ASK[it.kind]}
                {it.title === "Atomic Habits" && <Tap at={BT.tick} x={50} y={26} dark size={84} />}
                {done && read < 1 && ["#ff7a59", "#7b6cf6", "#2fb67c", "#ffb800"].map((c, j) => (
                  <span key={c} style={{ position: "absolute", left: "50%", top: "50%", width: 12, height: 12, borderRadius: 3, background: c, transform: `translate(${Math.cos(j * 1.7 + 0.4) * read * 70}px, ${Math.sin(j * 1.7 + 0.4) * read * 70}px) rotate(${read * 200}deg)`, opacity: 1 - read }} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <StatusBar />
    </AbsoluteFill>
  );
};

// ---------- 2. blank spines ----------
const Shelf: React.FC = () => {
  const f = useCurrentFrame();
  const spines = [["#dcd8ff", 70, 330], ["#ffd8cb", 56, 290], ["#cdf3e1", 80, 350], ["#fff0c4", 60, 310], ["#d6ebff", 66, 280], ["#ffd8cb", 52, 340], ["#dcd8ff", 74, 300]] as const;
  const out = prog(f, BT.drop - 8, BT.drop + 6);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 640, display: "flex", justifyContent: "center", opacity: 1 - out }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, paddingBottom: 18, borderBottom: "14px solid #fff", borderRadius: 4 }}>
        {spines.map(([c, w, h], i) => {
          const at = 132 + i * 8;
          const s = spring({ frame: f - at, fps: 30, config: { damping: 11, stiffness: 180 } });
          return (
            <div key={i} style={{ width: w * 1.4, height: h, background: c, borderRadius: 14, display: "grid", placeItems: "center", transform: `translateY(${(1 - s) * 400}px) rotate(${i === 6 ? -9 * s : 0}deg)`, transformOrigin: "bottom left", opacity: Math.min(1, s * 2), boxShadow: lift }}>
              <span style={{ ...D, fontSize: 64, color: "rgb(29 27 46 / .35)" }}>?</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------- 3. the turn: reels fly into the mark, titles come out ----------
const Turn: React.FC = () => {
  const f = useCurrentFrame();
  const t = f - BT.drop;
  const cx = 540, cy = 980;
  const pulse = 1 + 0.08 * Math.max(0, Math.sin((t / 15) * Math.PI * 2));
  const markIn = prog(f, BT.drop, BT.drop + 10, Easing.out(Easing.back(2)));
  const markOut = prog(f, BT.lists - 12, BT.lists);
  return (
    <AbsoluteFill style={{ opacity: 1 - markOut }}>
      {Array.from({ length: 18 }, (_, i) => {
        const at = BT.drop + i * 2;
        const p = prog(f, at, at + 22, Easing.in(Easing.cubic));
        if (p >= 1) return null;
        const a = (i / 18) * Math.PI * 2, r = 700;
        return <div key={i} style={{ position: "absolute", left: cx + Math.cos(a) * r * (1 - p) - 45, top: cy + Math.sin(a) * r * (1 - p) - 60, width: 90, height: 120, borderRadius: 14, background: `linear-gradient(160deg, ${TINTS[i % 5]}, #fff)`, display: "grid", placeItems: "center", fontSize: 44, opacity: f >= at ? 1 : 0, transform: `scale(${1 - p * 0.7}) rotate(${(1 - p) * 40}deg)`, boxShadow: lift }}>{BOOK_TILES[i % 6]}</div>;
      })}
      <div style={{ position: "absolute", left: cx - 150, top: cy - 150, width: 300, height: 300, borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center", boxShadow: "0 0 120px rgb(255 255 255 / .35)", transform: `scale(${markIn * pulse})` }}><Mark size={210} id="turn" /></div>
      {ITEMS.map((it, i) => {
        const at = BT.drop + 45 + i * 7;
        const p = prog(f, at, at + 20, Easing.out(Easing.cubic));
        if (f < at) return null;
        const a = -Math.PI / 2 + (i - 3) * 0.48, r = 430;
        return <div key={it.title} style={{ position: "absolute", left: cx + Math.cos(a) * r * p - 80, top: cy + Math.sin(a) * r * p * 0.9 + 120 - 120, transform: `scale(${0.4 + 0.6 * p}) rotate(${(i - 3) * 5 * p}deg)`, opacity: Math.min(1, p * 2) }}><Cover it={it} w={160} /></div>;
      })}
    </AbsoluteFill>
  );
};

// ---------- the film ----------
const Line: React.FC<{ show: boolean; children: React.ReactNode; top?: number }> = ({ show, children, top = 230 }) =>
  show ? <div style={{ position: "absolute", left: 60, right: 60, top, textAlign: "center" }}>{children}</div> : null;

export const BookList: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: f, fps, config: { damping: 16, stiffness: 120 } });
  const phoneDown = prog(f, BT.pain + 10, BT.pain + 30, Easing.inOut(Easing.cubic)) * (1 - prog(f, BT.lists - 14, BT.lists + 6, Easing.out(Easing.cubic)));
  const phoneGone = prog(f, BT.drop - 10, BT.drop + 4) * (1 - prog(f, BT.lists - 14, BT.lists + 6));
  const out = prog(f, BT.cta - 6, BT.cta + 14, Easing.in(Easing.cubic));
  const day = prog(f, BT.drop - 2, BT.drop + 10);
  const draw = prog(f, BT.cta + 8, BT.cta + 38);
  const fadeOut = prog(f, BT.end - 10, BT.end);
  const onDark = f < BT.drop;
  const ink = onDark ? "#fff" : C.ink;
  return (
    <AbsoluteFill style={{ background: NIGHT }}>
      <AbsoluteFill style={{ opacity: day }}><Ground /></AbsoluteFill>
      {f >= BT.pain + 20 && f < BT.drop + 4 && <Shelf />}
      {f >= BT.drop - 2 && f < BT.lists + 2 && <Turn />}
      {f < BT.cta + 16 && (
        <div style={{ position: "absolute", left: (1080 - 640) / 2, top: 580 + (1 - rise) * 1500 + phoneDown * 700 + out * 1400, opacity: 1 - phoneGone, transform: `scale(${1 - phoneDown * 0.1})`, transformOrigin: "50% 0%" }}>
          <Phone w={640} h={1300}>
            {f < BT.lists ? <BooksSaved /> : <ListsScreen />}
          </Phone>
        </div>
      )}

      <Line show={f < BT.pain + 4}><Kinetic captions={K(b1)} voAt={VO.b1} breakAfter={[2, 7]} style={{ color: ink, fontSize: 70, opacity: 1 - prog(f, BT.pain - 6, BT.pain + 4) }} /></Line>
      <Line show={f >= BT.pain && f < BT.drop}><Kinetic captions={K(b2)} voAt={VO.b2} breakAfter={[1]} style={{ color: "#fff", fontSize: 92, opacity: 1 - prog(f, BT.drop - 8, BT.drop) }} /></Line>
      <Line show={f >= BT.drop && f < BT.lists}><Kinetic captions={K(b3)} voAt={VO.b3} breakAfter={[3]} style={{ fontSize: 78, opacity: 1 - prog(f, BT.lists - 8, BT.lists) }} /></Line>
      <Line show={f >= BT.lists && f < BT.books - 6} top={250}><Kinetic captions={K(b4)} voAt={VO.b4} breakAfter={[2, 6]} style={{ fontSize: 64, opacity: 1 - prog(f, BT.books - 14, BT.books - 6) }} /></Line>
      <Line show={f >= BT.books - 6 && f < BT.cta} top={290}><Kinetic captions={K(b5)} voAt={VO.b5} breakAfter={[1]} style={{ fontSize: 80, opacity: 1 - prog(f, BT.cta - 8, BT.cta) }} /></Line>

      {f >= BT.cta - 2 && (
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 470 }}>
          <div style={{ transform: `scale(${0.9 + 0.1 * draw})` }}><Mark size={280} draw={draw} acorn={prog(f, BT.cta + 32, BT.cta + 44, Easing.out(Easing.back(2.5)))} id="bl-outro" /></div>
          <div style={{ ...D, fontSize: 150, color: C.ink, marginTop: 16, opacity: prog(f, VO.b6a - 2, VO.b6a + 8), transform: `scale(${0.92 + 0.08 * prog(f, VO.b6a - 2, VO.b6a + 10, Easing.out(Easing.back(2)))})` }}>Skwirl.</div>
          <div style={{ width: 940, textAlign: "center", marginTop: 26 }}><Kinetic captions={K(b6b)} voAt={VO.b6b} breakAfter={[5, 9]} style={{ fontSize: 58 }} /></div>
          <div style={{ marginTop: 34, fontFamily: ui, fontWeight: 600, fontSize: 34, color: C.ink, opacity: prog(f, VO.b6b + 120, VO.b6b + 132), background: "rgb(255 255 255 / .8)", padding: "14px 30px", borderRadius: 999, boxShadow: lift }}>Free · skwirl.parthakholkar.com</div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: NIGHT, opacity: fadeOut }} />

      {/* sound */}
      {[vo("b-1", VO.b1), vo("b-2", VO.b2), vo("b-3", VO.b3), vo("b-4", VO.b4), vo("b-5", VO.b5), vo("b-6a", VO.b6a), vo("b-6b", VO.b6b)]}
      {Array.from({ length: 10 }, (_, i) => sfx("sfx-switch2.ogg", 8 + i * 9, 0.18))}
      {Array.from({ length: 7 }, (_, i) => sfx("sfx-drop_002.ogg", 132 + i * 8 + 6, 0.22))}
      {sfx("sfx-riser.wav", BT.drop - 72, 0.35)}
      {sfx("sfx-whoosh.wav", BT.drop, 0.5)}
      {sfx("sfx-bong_001.ogg", BT.drop + 22, 0.35)}
      {ITEMS.map((_, i) => sfx("sfx-select_008.ogg", BT.drop + 45 + i * 7, 0.25))}
      {ROW_AT.map((t) => sfx("sfx-drop_002.ogg", t, 0.3))}
      {sfx("sfx-click_001.ogg", BT.books, 0.6)}
      {sfx("sfx-click_001.ogg", BT.tick, 0.6)}
      {sfx("sfx-select_008.ogg", BT.tick + 2, 0.6)}
      {sfx("sfx-bong_001.ogg", BT.tick + 4, 0.3)}
      <Audio src={staticFile("launch/music-vol1.mp3")} trimBefore={1201}
        volume={(fr) => {
          const base = interpolate(fr, [0, 20, BT.drop - 2, BT.drop, BT.end - 30, BT.end], [0, 0.1, 0.1, 0.33, 0.33, 0], { extrapolateRight: "clamp" });
          return base - duck(fr) * Math.max(0, base - DUCK_TO);
        }} />
    </AbsoluteFill>
  );
};
