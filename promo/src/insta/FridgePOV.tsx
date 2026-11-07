// Piece 5: "11:40pm. Fridge open." POV Reel, 1080×1920, ~19s. Faceless, fully animated.
// Story: dark kitchen → frantic Saved scroll → give up, open Skwirl → type "pasta" → the music DROPS on
// "Oh." as the card lands → it opens into the recipe, ingredients tick on the beat → logo draws.
// Sound: Kokoro VO (tts/generate_fridge_vo.py), fridge thud + hum and swipe whooshes (ffmpeg-made),
// Kenney UI clicks (CC0), music "Happy Beats / Business Moves Vol. 1" by Sascha Ende (CC BY 4.0).
// The music's 16.02s downbeat is pinned to the drop frame; after it, beats land every 15 frames.
import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { C, D, Ground, Kinetic, lift, Mark, Phone, prog, Tap, ui } from "../launch/kit";
import fp1 from "./captions/fp-1.json";
import fp2 from "./captions/fp-2.json";
import fp3 from "./captions/fp-3.json";
import fp4 from "./captions/fp-4.json";

export const T = { scroll: 120, home: 240, tap: 268, type: 286, drop: 330, note: 352, outro: 438, end: 575 };
const FLICKS = Array.from({ length: 6 }, (_, i) => T.scroll + 10 + i * 18);
const KEYS = [292, 298, 304, 310, 316];
const TICKS = [375, 390, 405, 420];
const NIGHT = "#0c0b12";

const sfx = (src: string, at: number, volume = 0.6) => (
  <Sequence key={`${src}${at}`} from={at} layout="none"><Audio src={staticFile(`insta/${src}`)} volume={volume} /></Sequence>
);

// ---------- 1. the fridge ----------
const Fridge: React.FC = () => {
  const f = useCurrentFrame();
  const open = prog(f, 4, 30, Easing.out(Easing.cubic));
  const flicker = 1 - 0.06 * Math.max(0, Math.sin(f * 1.7)) * (f < 40 ? 1 : 0);
  const away = prog(f, T.scroll - 10, T.scroll + 20);
  const push = 1 + prog(f, 0, T.scroll, Easing.linear) * 0.06;
  return (
    <AbsoluteFill style={{ background: NIGHT, transform: `scale(${push})` }}>
      <AbsoluteFill style={{ background: `radial-gradient(60% 48% at 50% 66%, rgb(255 236 196 / ${0.6 * open * flicker * (1 - away * 0.7)}), transparent 72%)` }} />
      <div style={{ position: "absolute", left: 240, top: 650, width: 600, height: 1000, opacity: 1 - away * 0.9 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 34, background: "#fffaf0", boxShadow: `0 0 ${200 * open}px rgb(255 240 210 / ${0.85 * flicker})`, overflow: "hidden" }}>
          {[250, 520, 790].map((y) => <div key={y} style={{ position: "absolute", left: 34, right: 34, top: y, height: 12, borderRadius: 6, background: "#ece4d2" }} />)}
          <div style={{ position: "absolute", top: 120, left: 70, fontSize: 130 }}>🥚</div>
          <div style={{ position: "absolute", top: 130, left: 330, fontSize: 110 }}>🥛</div>
          <div style={{ position: "absolute", top: 390, left: 290, fontSize: 130 }}>🧈</div>
          <div style={{ position: "absolute", top: 660, left: 110, fontSize: 130 }}>🧀</div>
          <div style={{ position: "absolute", top: 660, left: 360, fontSize: 120 }}>🍋</div>
        </div>
        {/* the door swings open toward us */}
        <div style={{ position: "absolute", inset: 0, borderRadius: 34, background: "linear-gradient(90deg, #2a2735, #1c1a26)", boxShadow: "inset 0 0 0 3px #3a3648",
          transform: `perspective(1600px) rotateY(${-open * 105}deg)`, transformOrigin: "left center", backfaceVisibility: "hidden" }}>
          <div style={{ position: "absolute", right: 34, top: 380, width: 16, height: 240, borderRadius: 8, background: "#4a4658" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 2. the frantic scroll ----------
const GRID = ["🏋️", "😂", "🏋️", "🐶", "🏋️", "💪", "😂", "🏋️", "✈️", "🏋️", "🧘", "😂", "🏋️", "💪", "🎧", "🏋️", "😂", "🏋️"];
const TINTS = [C.lavender, C.peach, C.mint, C.sky, C.butter];
const scrolled = (f: number) => FLICKS.reduce((y, at) => y + 1100 * prog(f, at, at + 16, Easing.out(Easing.cubic)), 0);
const SavedScroll: React.FC = () => {
  const f = useCurrentFrame();
  const y = scrolled(f);
  const vel = scrolled(f) - scrolled(f - 1);
  const count = Math.min(400, Math.round(y / 16.5));
  const thumbAt = [...FLICKS].reverse().find((a) => f >= a - 4);
  const tp = thumbAt === undefined ? 0 : prog(f, thumbAt - 4, thumbAt + 10, Easing.inOut(Easing.quad));
  return (
    <AbsoluteFill style={{ background: "#fff" }}>
      <div style={{ position: "absolute", top: 140, left: 4, right: 4, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, transform: `translateY(${-(y % 2600)}px)`, filter: `blur(${Math.min(vel / 14, 6)}px)` }}>
        {Array.from({ length: 120 }, (_, i) => (
          <div key={i} style={{ aspectRatio: "9 / 16", background: `linear-gradient(160deg, ${TINTS[i % 5]}, #fff)`, display: "grid", placeItems: "center", fontSize: 70 }}>{GRID[i % GRID.length]}</div>
        ))}
      </div>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 140, paddingTop: 78, boxSizing: "border-box", textAlign: "center", fontWeight: 700, fontSize: 32, color: "#111", background: "#fff", zIndex: 2 }}>Saved</div>
      <div style={{ position: "absolute", right: 22, top: 158, zIndex: 3, padding: "10px 18px", borderRadius: 999, background: C.ink, color: "#fff", fontFamily: ui, fontWeight: 600, fontSize: 26, fontVariantNumeric: "tabular-nums" }}>{count} / 400</div>
      {thumbAt !== undefined && tp < 1 && (
        <div style={{ position: "absolute", left: 300, top: 980 - tp * 620, width: 96, height: 120, borderRadius: "50%", background: "rgb(255 255 255 / .55)", border: "3px solid rgb(29 27 46 / .25)", zIndex: 4, opacity: Math.sin(tp * Math.PI) }} />
      )}
    </AbsoluteFill>
  );
};

// ---------- 3. home screen → tap Skwirl ----------
const APPS = ["📷", "🗺️", "📅", "💬", "🎵", "⚙️", "📝", "☁️", "🛒", "📺", "🏦", "⏰", "🧮", "📚", "🎮"];
const ICON_TINTS = ["#ffd8cb", "#d6ebff", "#cdf3e1", "#fff0c4", "#dcd8ff"];
const SK_ICON = { x: 300, y: 690 };
const Home: React.FC = () => (
  <AbsoluteFill style={{ background: "linear-gradient(170deg, #b9b0ff, #ffc9b8)", padding: "130px 44px 0" }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", rowGap: 46, columnGap: 30 }}>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} style={{ display: "grid", justifyItems: "center", gap: 8 }}>
          {i === 10 ? (
            <div style={{ width: 112, height: 112, borderRadius: 28, background: "#fff", display: "grid", placeItems: "center", boxShadow: "0 6px 16px rgb(0 0 0 / .12)" }}><Mark size={78} id="home" /></div>
          ) : (
            <div style={{ width: 112, height: 112, borderRadius: 28, background: ICON_TINTS[i % 5], display: "grid", placeItems: "center", fontSize: 56, boxShadow: "0 6px 16px rgb(0 0 0 / .1)" }}>{APPS[i % APPS.length]}</div>
          )}
          <span style={{ fontFamily: ui, fontSize: 22, color: "#fff", fontWeight: 600, textShadow: "0 1px 4px rgb(0 0 0 / .3)", minHeight: 28 }}>{i === 10 ? "Skwirl" : ""}</span>
        </div>
      ))}
    </div>
    <Tap at={T.tap} x={SK_ICON.x} y={SK_ICON.y} size={120} />
  </AbsoluteFill>
);

// ---------- 4. Skwirl: type "pasta", the card lands ----------
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const Keyboard: React.FC<{ down: string | null }> = ({ down }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 440, background: "#d6d3df", padding: "26px 8px 0", display: "grid", gap: 18, alignContent: "start" }}>
    {ROWS.map((r) => (
      <div key={r} style={{ display: "flex", justifyContent: "center", gap: 7 }}>
        {[...r].map((k) => (
          <div key={k} style={{ width: 49, height: 76, borderRadius: 10, background: k === down ? C.ink : "#fff", color: k === down ? "#fff" : "#111", display: "grid", placeItems: "center", fontSize: 34,
            transform: k === down ? "translateY(-10px) scale(1.25)" : undefined, boxShadow: "0 2px 0 rgb(0 0 0 / .18)" }}>{k}</div>
        ))}
      </div>
    ))}
  </div>
);
const PastaCard: React.FC = () => (
  <>
    <div style={{ height: 430, background: `linear-gradient(160deg, ${C.peach}, ${C.butter})`, display: "grid", placeItems: "center", fontSize: 150, position: "relative" }}>
      🍝🧄<span style={{ position: "absolute", left: 18, top: 18, fontSize: 24, fontWeight: 500, padding: "6px 16px", borderRadius: 999, background: C.peach, color: C.peachInk }}>Unused</span>
    </div>
    <div style={{ padding: "20px 24px 26px" }}>
      <div style={{ fontWeight: 600, fontSize: 40, lineHeight: 1.2, color: C.ink }}>Garlic butter pasta in 15 minutes</div>
      <div style={{ fontSize: 28, color: C.muted, marginTop: 10 }}>Food · saved 3 months ago</div>
    </div>
  </>
);
const Find: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = KEYS.filter((k) => f >= k).length;
  const typed = "pasta".slice(0, n);
  const down = KEYS.findIndex((k) => f >= k && f < k + 5);
  const pop = spring({ frame: f - T.drop, fps, config: { damping: 11, stiffness: 170 } });
  const kbAway = prog(f, T.drop - 6, T.drop + 6);
  return (
    <AbsoluteFill style={{ background: C.bg, padding: "92px 30px 0", fontFamily: ui }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, ...D, fontSize: 44, color: C.ink }}><Mark size={46} id="fp" />Skwirl</div>
      <div style={{ marginTop: 26, height: 84, borderRadius: 999, background: "#fff", boxShadow: lift, display: "flex", alignItems: "center", padding: "0 30px", fontSize: 34, color: typed ? C.ink : C.muted }}>
        🔍&nbsp;&nbsp;{typed || "Search your saves"}<span style={{ width: 3, height: 40, background: C.ink, marginLeft: 3, opacity: f > T.drop ? 0 : Math.floor(f / 8) % 2 }} />
      </div>
      <div style={{ marginTop: 34, borderRadius: 36, overflow: "hidden", background: "#fff", boxShadow: lift, opacity: Math.min(1, pop * 1.5), transform: `translateY(${(1 - pop) * 120}px) scale(${0.8 + 0.2 * pop})`, transformOrigin: "top center" }}>
        <PastaCard />
      </div>
      <div style={{ opacity: 1 - kbAway, transform: `translateY(${kbAway * 300}px)` }}><Keyboard down={down >= 0 ? "pasta"[down] : null} /></div>
    </AbsoluteFill>
  );
};

// ---------- 5. the note: ingredients tick on the beat ----------
const INGREDIENTS = ["200g spaghetti", "4 cloves garlic, thinly sliced", "3 tbsp butter", "1 tsp chilli flakes"];
const Note: React.FC = () => {
  const f = useCurrentFrame();
  const scroll = prog(f, T.note + 8, T.note + 24) * 330;
  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: ui, overflow: "hidden" }}>
      <div style={{ transform: `translateY(${-scroll}px)` }}>
        <div style={{ height: 560, background: `linear-gradient(160deg, ${C.peach}, ${C.butter})`, display: "grid", placeItems: "center", fontSize: 190, paddingTop: 60 }}>🍝🧄</div>
        <div style={{ padding: "30px 36px" }}>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ fontSize: 24, padding: "6px 16px", borderRadius: 999, background: C.peach, color: C.peachInk }}>Unused</span>
            <span style={{ fontSize: 24, padding: "6px 16px", borderRadius: 999, background: "#fff" }}>Food</span>
          </div>
          <div style={{ ...D, fontSize: 56, lineHeight: 1.05, color: C.ink, marginTop: 18 }}>Garlic butter pasta in 15 minutes</div>
          <div style={{ fontWeight: 600, fontSize: 30, marginTop: 34, color: C.ink }}>Ingredients</div>
          {INGREDIENTS.map((t, i) => {
            const on = prog(f, TICKS[i], TICKS[i] + 6, Easing.out(Easing.back(2)));
            return (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 20, fontSize: 32, color: C.ink }}>
                <span style={{ width: 44, height: 44, borderRadius: 12, border: `3px solid ${C.ink}`, background: on > 0 ? C.ink : "#fff", display: "grid", placeItems: "center", color: "#fff", fontSize: 28, transform: `scale(${1 + Math.sin(on * Math.PI) * 0.25})` }}>{on > 0.3 ? "✓" : ""}</span>
                <span style={{ opacity: 1 - on * 0.45, textDecoration: on > 0.6 ? "line-through" : "none" }}>{t}</span>
              </div>
            );
          })}
          <div style={{ fontWeight: 600, fontSize: 30, marginTop: 34, color: C.ink }}>Steps</div>
          <div style={{ fontSize: 30, color: C.muted, marginTop: 12, lineHeight: 1.4 }}>1. Boil the pasta. Melt the butter low and slow…</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- the film ----------
export const FridgePOV: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: f - (T.scroll - 14), fps, config: { damping: 15, stiffness: 110 } });
  const shake = f > T.home - 22 && f < T.home ? Math.sin(f * 2.4) * 10 : 0;
  const toHome = prog(f, T.home, T.home + 10), toFind = prog(f, T.tap + 2, T.tap + 14, Easing.out(Easing.cubic)), toNote = prog(f, T.note, T.note + 12);
  const punch = spring({ frame: f - T.drop, fps, config: { damping: 9, stiffness: 140 } });
  const settle = prog(f, T.note + 20, T.note + 40);
  const out = prog(f, T.outro - 6, T.outro + 14, Easing.in(Easing.cubic));
  const day = prog(f, T.outro - 4, T.outro + 14);
  const draw = prog(f, T.outro + 6, T.outro + 36);
  const fadeOut = prog(f, T.end - 10, T.end);
  const appZoom = 0.08 + 0.92 * toFind;
  return (
    <AbsoluteFill style={{ background: NIGHT }}>
      {f < T.scroll + 30 && <Fridge />}
      <AbsoluteFill style={{ opacity: day }}><Ground /></AbsoluteFill>
      {f >= T.scroll - 14 && f < T.outro + 16 && (
        <div style={{ position: "absolute", left: (1080 - 640) / 2 + shake, top: 560 + (1 - rise) * 1500 + out * 1400, transform: `scale(${1 + (f >= T.drop ? punch * 0.05 * (1 - settle) : 0)})`, transformOrigin: "50% 40%" }}>
          <Phone w={640} h={1300}>
            <AbsoluteFill style={{ opacity: 1 - toHome, transform: `scale(${1 - toHome * 0.12})`, borderRadius: 40 }}><SavedScroll /></AbsoluteFill>
            {f >= T.home && <AbsoluteFill style={{ opacity: toHome }}><Home /></AbsoluteFill>}
            {f >= T.tap + 2 && (
              <AbsoluteFill style={{ transform: `scale(${appZoom})`, transformOrigin: `${SK_ICON.x}px ${SK_ICON.y}px`, opacity: Math.min(1, toFind * 2), borderRadius: 54 * (1 - toFind), overflow: "hidden" }}>
                <AbsoluteFill style={{ opacity: 1 - toNote }}><Find /></AbsoluteFill>
                {f >= T.note && <AbsoluteFill style={{ opacity: toNote }}><Note /></AbsoluteFill>}
              </AbsoluteFill>
            )}
          </Phone>
        </div>
      )}

      {/* words, on the voice's own timestamps */}
      <div style={{ position: "absolute", left: 70, right: 70, top: 250, textAlign: "center" }}>
        {f < T.scroll + 4 && <Kinetic captions={fp1 as Caption[]} voAt={10} breakAfter={[0]} style={{ color: "#fff", fontSize: 80, opacity: 1 - prog(f, T.scroll - 6, T.scroll + 4) }} />}
        {f >= T.scroll && f < T.home + 6 && <Kinetic captions={fp2 as Caption[]} voAt={140} breakAfter={[2]} style={{ color: "#fff", fontSize: 88, opacity: 1 - prog(f, T.home - 4, T.home + 6) }} />}
        {f >= T.type - 4 && f < T.drop - 2 && <div style={{ ...D, color: "#fff", fontSize: 120, opacity: prog(f, T.type - 4, T.type + 6) }}>…</div>}
        {f >= T.drop - 2 && f < T.note + 14 && <Kinetic captions={fp3 as Caption[]} voAt={T.drop - 13} lead={0} style={{ color: "#fff", fontSize: 170, opacity: 1 - prog(f, T.note + 4, T.note + 14) }} />}
        {f >= T.note + 10 && f < T.outro && (
          <div style={{ ...D, color: "#fff", fontSize: 76, lineHeight: 1.08, opacity: prog(f, T.note + 10, T.note + 20) * (1 - prog(f, T.outro - 8, T.outro)), transform: `translateY(${(1 - prog(f, T.note + 10, T.note + 22)) * 20}px)` }}>
            Saved 3 months ago.<br />Found in 2 seconds.
          </div>
        )}
      </div>

      {/* outro: the mark draws itself, the line lands word by word */}
      {f >= T.outro - 2 && (
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 560 }}>
          <div style={{ transform: `scale(${0.9 + 0.1 * draw})` }}><Mark size={300} draw={draw} acorn={prog(f, T.outro + 30, T.outro + 42, Easing.out(Easing.back(2.5)))} id="outro" /></div>
          <div style={{ ...D, fontSize: 150, color: C.ink, marginTop: 20, opacity: prog(f, T.outro + 6, T.outro + 18) }}>Skwirl</div>
          <div style={{ width: 900, textAlign: "center", marginTop: 24 }}>
            <Kinetic captions={fp4 as Caption[]} voAt={T.outro + 2} skip={1} breakAfter={[7]} style={{ fontSize: 66 }} />
          </div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: NIGHT, opacity: fadeOut }} />

      {/* sound */}
      <Audio src={staticFile("insta/sfx-hum.wav")} volume={0.55} />
      {sfx("sfx-thud.wav", 4, 0.9)}
      <Sequence from={10} layout="none"><Audio src={staticFile("insta/fp-1.wav")} /></Sequence>
      <Sequence from={140} layout="none"><Audio src={staticFile("insta/fp-2.wav")} /></Sequence>
      {FLICKS.map((at) => sfx("sfx-whoosh.wav", at - 2, 0.55))}
      {sfx("sfx-switch2.ogg", T.home, 0.5)}
      {sfx("sfx-click_001.ogg", T.tap, 0.8)}
      {KEYS.map((k) => sfx("sfx-click_001.ogg", k, 0.45))}
      <Sequence from={T.drop - 13} layout="none"><Audio src={staticFile("insta/fp-3.wav")} /></Sequence>
      {sfx("sfx-riser.wav", T.drop - 72, 0.5)}
      {sfx("sfx-drop_002.ogg", T.drop, 0.8)}
      <Sequence from={T.drop} layout="none">
        <Audio src={staticFile("launch/music-vol1.mp3")} trimBefore={481}
          volume={(fr) => interpolate(fr, [0, 2, T.end - T.drop - 24, T.end - T.drop], [0, 0.34, 0.34, 0], { extrapolateRight: "clamp" })} />
      </Sequence>
      {sfx("sfx-bong_001.ogg", T.note, 0.35)}
      {TICKS.map((t) => sfx("sfx-select_008.ogg", t, 0.6))}
      <Sequence from={T.outro + 2} layout="none"><Audio src={staticFile("insta/fp-4.wav")} /></Sequence>
    </AbsoluteFill>
  );
};
