// Piece 5 v2: "11:40pm. Fridge open." 1080×1920, 34.5s. Script + evaluation: promo/scripts/05-fridge-v2.md.
// Hook (fridge) → pain (a Saved page laid out like Instagram's: no logo, no real creators) → truth →
// flashback "3 months ago" (share the reel to Skwirl: the how) → now: search, music DROPS as the card lands →
// the note, ingredients tick on the beat → "Skwirl." [pause] promise + link → loops through black.
// Sound: Kokoro VO (tts/generate_fridge_vo.py), ffmpeg-made fridge/whoosh/riser, Kenney clicks (CC0),
// music "Happy Beats / Business Moves Vol. 1" by Sascha Ende (CC BY 4.0) entering at frame 210 so its
// 16.02s downbeat lands on the drop (690). Every cut sits on the 15-frame beat grid.
import React from "react";
import { AbsoluteFill, Audio, Easing, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { C, D, Ground, Kinetic, lift, Mark, Phone, prog, Tap, ui } from "../launch/kit";
import v1 from "./captions/f2-1.json";
import v2 from "./captions/f2-2.json";
import v3 from "./captions/f2-3.json";
import v4 from "./captions/f2-4.json";
import v5a from "./captions/f2-5a.json";
import v5b from "./captions/f2-5b.json";
import v6 from "./captions/f2-6.json";
import v7b from "./captions/f2-7b.json";

export const T = { pain: 150, allPosts: 180, truth: 330, flash: 435, share: 478, pick: 508, now: 570, tap: 600, drop: 690, note: 735, cta: 825, end: 1035 };
const VO = { v1: 6, v2: 165, v3: 345, v4: 495, v5a: 688, v5b: 716, v6: 750, v7a: 842, v7b: 890 };
const FLICKS = Array.from({ length: 7 }, (_, i) => 195 + i * 18);
const KEYS = [622, 628, 634, 640, 646];
const TICKS = [765, 780, 795, 810];
const NIGHT = "#0c0b12";
const SYS = "-apple-system, 'SF Pro Text', system-ui, sans-serif";

const sfx = (src: string, at: number, volume = 0.6) => (
  <Sequence key={`${src}${at}`} from={at} layout="none"><Audio src={staticFile(`insta/${src}`)} volume={volume} /></Sequence>
);
const vo = (src: string, at: number) => <Sequence key={src} from={at} layout="none"><Audio src={staticFile(`insta/${src}.wav`)} /></Sequence>;

// ---------- small line icons (drawn, not anyone's logo) ----------
const Ico: React.FC<{ d: string; size?: number; fill?: string; stroke?: string; w?: number }> = ({ d, size = 40, fill = "none", stroke = "#111", w = 2.2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const I = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z", search: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM16 16l5 5",
  plus: "M4 4h16v16H4zM12 8v8M8 12h8", reels: "M4 4h16v16H4zM4 9h16M9 4l3 5M15 4l3 5M10.5 12.5v5l4-2.5z",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z", comment: "M20 12a8 8 0 1 1-3.3-6.5L20 4l-1 4.2A8 8 0 0 1 20 12z",
  send: "M21 3 10 14M21 3l-7 18-4-7-7-4z", save: "M6 3h12v18l-6-5-6 5z", back: "M15 5l-7 7 7 7", dots: "M5 12h.01M12 12h.01M19 12h.01",
};
const StatusBar: React.FC<{ dark?: boolean }> = ({ dark }) => (
  <div style={{ position: "absolute", top: 22, left: 40, right: 36, display: "flex", justifyContent: "space-between", fontFamily: SYS, fontWeight: 600, fontSize: 26, color: dark ? "#fff" : "#111", zIndex: 10 }}>
    <span>11:40</span><span style={{ letterSpacing: 2 }}>▮▮▮ ◔ ▭</span>
  </div>
);
const BottomNav: React.FC = () => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 108, background: "#fff", borderTop: "1px solid #e6e6e6", display: "flex", justifyContent: "space-around", alignItems: "center", paddingBottom: 18, zIndex: 5 }}>
    {[I.home, I.search, I.plus, I.reels].map((d) => <Ico key={d} d={d} size={44} />)}
    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #c9c2ff, #ffc6b5)", border: "2px solid #111" }} />
  </div>
);

// ---------- 1. the fridge ----------
const Fridge: React.FC = () => {
  const f = useCurrentFrame();
  const open = prog(f, 4, 32, Easing.out(Easing.cubic));
  const flicker = 1 - 0.07 * Math.max(0, Math.sin(f * 1.7)) * (f < 44 ? 1 : 0);
  const away = prog(f, T.pain - 12, T.pain + 18);
  const push = 1 + prog(f, 0, T.pain, Easing.linear) * 0.07;
  return (
    <AbsoluteFill style={{ background: NIGHT, transform: `scale(${push})` }}>
      <AbsoluteFill style={{ background: `radial-gradient(60% 48% at 50% 68%, rgb(255 236 196 / ${0.6 * open * flicker * (1 - away * 0.75)}), transparent 72%)` }} />
      <div style={{ position: "absolute", left: 240, top: 700, width: 600, height: 1000, opacity: 1 - away * 0.92 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 34, background: "#fffaf0", boxShadow: `0 0 ${200 * open}px rgb(255 240 210 / ${0.85 * flicker})`, overflow: "hidden" }}>
          {[250, 520, 790].map((y) => <div key={y} style={{ position: "absolute", left: 34, right: 34, top: y, height: 12, borderRadius: 6, background: "#ece4d2" }} />)}
          {([["🥚", 120, 70, 130], ["🥛", 130, 330, 110], ["🧈", 390, 290, 130], ["🧀", 660, 110, 130], ["🍋", 660, 360, 120]] as const).map(([e, t, l, s]) => (
            <div key={e} style={{ position: "absolute", top: t, left: l, fontSize: s }}>{e}</div>
          ))}
        </div>
        <div style={{ position: "absolute", inset: 0, borderRadius: 34, background: "linear-gradient(90deg, #2a2735, #1c1a26)", boxShadow: "inset 0 0 0 3px #3a3648",
          transform: `perspective(1600px) rotateY(${-open * 105}deg)`, transformOrigin: "left center", backfaceVisibility: "hidden" }}>
          <div style={{ position: "absolute", right: 34, top: 380, width: 16, height: 240, borderRadius: 8, background: "#4a4658" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 2. a Saved page laid out like Instagram's ----------
const GRID = ["🏋️", "😂", "🏋️", "🐶", "💪", "🏋️", "😂", "🏋️", "✈️", "🏋️", "🧘", "😂", "💪", "🏋️", "🎧", "🏋️", "😹", "🏋️", "🏃", "😂", "🏋️"];
const TINTS = [C.lavender, C.peach, C.mint, C.sky, C.butter];
const VIEWS = ["2.1M", "843K", "5.6M", "120K", "1.2M", "390K", "3.3M", "77K", "960K"];
const scrolled = (f: number) => FLICKS.reduce((y, at) => y + 1250 * prog(f, at, at + 16, Easing.out(Easing.cubic)), 0);
const COLLECTIONS: [string, string[]][] = [["All posts", ["🏋️", "😂", "🍝", "💪"]], ["Gym", ["🏋️", "💪", "🏃", "🧘"]], ["Recipes 🙃", ["🍕", "🥗", "🍜", "🧁"]], ["Travel", ["✈️", "🗻", "🏝️", "🗼"]]];
const Collections: React.FC = () => (
  <AbsoluteFill style={{ background: "#fff", fontFamily: SYS, padding: "150px 22px 0" }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      {COLLECTIONS.map(([name, es], k) => (
        <div key={name}>
          <div style={{ aspectRatio: "1", borderRadius: 14, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            {es.map((e, i) => <div key={i} style={{ background: `linear-gradient(160deg, ${TINTS[(i + k) % 5]}, #fff)`, display: "grid", placeItems: "center", fontSize: 46 }}>{e}</div>)}
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, marginTop: 10, color: "#111" }}>{name}</div>
        </div>
      ))}
    </div>
  </AbsoluteFill>
);
const Header: React.FC<{ title: string }> = ({ title }) => (
  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 140, paddingTop: 76, boxSizing: "border-box", background: "#fff", zIndex: 4, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SYS, fontWeight: 700, fontSize: 32, color: "#111" }}>
    <span style={{ position: "absolute", left: 18, top: 72 }}><Ico d={I.back} size={44} /></span>{title}<span style={{ position: "absolute", right: 22, top: 72 }}><Ico d="M12 5v14M5 12h14" size={42} /></span>
  </div>
);
const AllPosts: React.FC<{ frozenAt?: number }> = ({ frozenAt }) => {
  const live = useCurrentFrame();
  const f = frozenAt === undefined ? live : Math.min(live, frozenAt);
  const y = scrolled(f), vel = frozenAt !== undefined && live > frozenAt ? 0 : scrolled(f) - scrolled(f - 1);
  const count = Math.min(400, Math.round(y / 21.8));
  const thumbAt = [...FLICKS].reverse().find((a) => f >= a - 4);
  const tp = thumbAt === undefined ? 1 : prog(f, thumbAt - 4, thumbAt + 10, Easing.inOut(Easing.quad));
  return (
    <AbsoluteFill style={{ background: "#fff", fontFamily: SYS }}>
      <div style={{ position: "absolute", top: 140, left: 0, right: 0, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, transform: `translateY(${-(y % 3200)}px)`, filter: `blur(${Math.min(vel / 14, 7)}px)` }}>
        {Array.from({ length: 140 }, (_, i) => (
          <div key={i} style={{ aspectRatio: "3 / 4", background: `linear-gradient(160deg, ${TINTS[i % 5]}, #fff)`, display: "grid", placeItems: "center", fontSize: 66, position: "relative" }}>
            {GRID[i % GRID.length]}
            <span style={{ position: "absolute", top: 10, right: 10 }}><Ico d={I.reels} size={28} stroke="#fff" w={2.6} /></span>
            <span style={{ position: "absolute", left: 10, bottom: 8, fontSize: 20, fontWeight: 600, color: "#fff", textShadow: "0 1px 3px rgb(0 0 0 / .45)" }}>▷ {VIEWS[i % VIEWS.length]}</span>
          </div>
        ))}
      </div>
      <Header title="All posts" />
      <div style={{ position: "absolute", right: 20, top: 156, zIndex: 6, padding: "10px 18px", borderRadius: 999, background: "rgb(0 0 0 / .78)", color: "#fff", fontWeight: 700, fontSize: 26, fontVariantNumeric: "tabular-nums" }}>{count} / 400</div>
      {tp < 1 && <div style={{ position: "absolute", left: 300, top: 1000 - tp * 640, width: 96, height: 120, borderRadius: "50%", background: "rgb(255 255 255 / .55)", border: "3px solid rgb(0 0 0 / .22)", zIndex: 7, opacity: Math.sin(tp * Math.PI) }} />}
      <BottomNav />
    </AbsoluteFill>
  );
};
const SavedFlow: React.FC<{ frozen?: boolean }> = ({ frozen }) => {
  const f = useCurrentFrame();
  const toAll = prog(f, T.allPosts + 2, T.allPosts + 12, Easing.out(Easing.cubic));
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - toAll }}><Collections /><Header title="Saved" /><BottomNav /><Tap at={T.allPosts} x={160} y={300} dark size={110} /></AbsoluteFill>
      {f >= T.allPosts + 2 && <AbsoluteFill style={{ transform: `translateX(${(1 - toAll) * 120}px)`, opacity: toAll }}><AllPosts frozenAt={frozen ? T.truth : undefined} /></AbsoluteFill>}
      <StatusBar />
    </AbsoluteFill>
  );
};

// ---------- 4. flashback: 3 months ago, he shared it to Skwirl ----------
const SHARE_ACTIONS = ["Add to story", "Copy link", "Skwirl", "Share to…"];
const Reel: React.FC = () => {
  const f = useCurrentFrame();
  const t = f - T.flash;
  const sheet = spring({ frame: f - (T.share + 4), fps: 30, config: { damping: 18, stiffness: 150 } }) * (1 - prog(f, T.pick + 6, T.pick + 16));
  const toast = prog(f, T.pick + 8, T.pick + 18) * (1 - prog(f, T.now - 14, T.now - 4));
  return (
    <AbsoluteFill style={{ fontFamily: SYS, color: "#fff", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: `linear-gradient(170deg, ${C.peach}, ${C.butter} 60%, #ffd9a8)`, display: "grid", placeItems: "center" }}>
        <div style={{ fontSize: 300, transform: `scale(${1 + Math.sin(t / 9) * 0.04}) rotate(${Math.sin(t / 14) * 3}deg)` }}>🍝</div>
        <div style={{ position: "absolute", top: 760, left: 330, fontSize: 130, transform: `rotate(${Math.sin(t / 11) * 8}deg)` }}>🧄</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgb(0 0 0 / .35), transparent 22%, transparent 62%, rgb(0 0 0 / .55))" }} />
      <div style={{ position: "absolute", top: 72, left: 30, fontWeight: 700, fontSize: 36 }}>Reels</div>
      <div style={{ position: "absolute", right: 22, bottom: 240, display: "grid", gap: 30, justifyItems: "center", fontSize: 22, fontWeight: 600 }}>
        <div style={{ display: "grid", justifyItems: "center" }}><Ico d={I.heart} size={52} stroke="#fff" />48.2K</div>
        <div style={{ display: "grid", justifyItems: "center" }}><Ico d={I.comment} size={52} stroke="#fff" />312</div>
        <div style={{ position: "relative" }}><Ico d={I.send} size={52} stroke="#fff" /><Tap at={T.share} x={26} y={26} size={90} /></div>
        <Ico d={I.save} size={52} stroke="#fff" fill="#fff" />
        <Ico d={I.dots} size={52} stroke="#fff" w={4} />
      </div>
      <div style={{ position: "absolute", left: 28, bottom: 150, right: 120 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontWeight: 700, fontSize: 28 }}>
          <span style={{ width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg, #ffb199, #ff7a59)", border: "3px solid #fff" }} />pastanight<span style={{ border: "2px solid #fff", borderRadius: 10, padding: "4px 14px", fontSize: 24 }}>Follow</span>
        </div>
        <div style={{ fontSize: 28, marginTop: 14 }}>15-min garlic butter pasta 🧄🍝 save this for later</div>
        <div style={{ fontSize: 24, marginTop: 10, opacity: 0.9 }}>♫ original audio</div>
      </div>
      <div style={{ position: "absolute", left: 0, bottom: 108, height: 4, width: `${Math.min(100, (t / 135) * 100)}%`, background: "#fff" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 108, background: "#000", display: "flex", justifyContent: "space-around", alignItems: "center", paddingBottom: 18 }}>
        {[I.home, I.search, I.plus, I.reels].map((d) => <Ico key={d} d={d} size={44} stroke="#fff" />)}
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #c9c2ff, #ffc6b5)", border: "2px solid #fff" }} />
      </div>
      <AbsoluteFill style={{ background: `rgb(0 0 0 / ${0.35 * sheet})` }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 560, background: "#fff", borderRadius: "36px 36px 0 0", transform: `translateY(${(1 - sheet) * 600}px)`, color: "#111", padding: "18px 28px" }}>
        <div style={{ width: 70, height: 8, borderRadius: 4, background: "#ddd", margin: "0 auto 22px" }} />
        <div style={{ height: 70, borderRadius: 16, background: "#f1f1f3", display: "flex", alignItems: "center", gap: 12, padding: "0 20px", fontSize: 28, color: "#888" }}><Ico d={I.search} size={30} stroke="#888" />Search</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 34 }}>
          {[["Riya", "#ffd8cb"], ["Aman", "#d6ebff"], ["Mom", "#cdf3e1"], ["Gym bros", "#fff0c4"]].map(([n, c]) => (
            <div key={n} style={{ display: "grid", justifyItems: "center", gap: 10, fontSize: 22 }}><span style={{ width: 104, height: 104, borderRadius: "50%", background: c }} />{n}</div>
          ))}
        </div>
        <div style={{ height: 1, background: "#eee", margin: "30px 0 24px" }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {SHARE_ACTIONS.map((n) => (
            <div key={n} style={{ display: "grid", justifyItems: "center", gap: 10, fontSize: 22, position: "relative" }}>
              <span style={{ width: 96, height: 96, borderRadius: "50%", background: n === "Skwirl" ? "#fff" : "#f1f1f3", border: n === "Skwirl" ? `3px solid ${C.ink}` : "none", display: "grid", placeItems: "center", fontSize: 38 }}>
                {n === "Skwirl" ? <Mark size={62} id="share" /> : n === "Copy link" ? "🔗" : n === "Add to story" ? "⊕" : "↗"}
              </span>{n}
              {n === "Skwirl" && <Tap at={T.pick} x={48} y={48} dark size={110} />}
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", top: 130, left: "50%", transform: `translate(-50%, ${(1 - toast) * -40}px)`, opacity: toast, padding: "18px 30px", borderRadius: 999, background: C.ink, color: "#fff", display: "flex", alignItems: "center", gap: 14, fontFamily: ui, fontWeight: 600, fontSize: 28, whiteSpace: "nowrap", boxShadow: lift }}>
        <span style={{ filter: "invert(1) hue-rotate(180deg)", display: "inline-flex" }}><Mark size={34} id="toast" /></span> Saved to Skwirl ✓
      </div>
      <StatusBar dark />
    </AbsoluteFill>
  );
};

// ---------- 5. now: home → Skwirl → "pasta" ----------
const APPS = ["📷", "🗺️", "📅", "💬", "🎵", "⚙️", "📝", "☁️", "🛒", "📺", "🏦", "⏰", "🧮", "📚", "🎮"];
const ICON_TINTS = ["#ffd8cb", "#d6ebff", "#cdf3e1", "#fff0c4", "#dcd8ff"];
const SK_ICON = { x: 300, y: 690 };
const Home: React.FC = () => (
  <AbsoluteFill style={{ background: "linear-gradient(170deg, #b9b0ff, #ffc9b8)", padding: "130px 44px 0" }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", rowGap: 46, columnGap: 30 }}>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i} style={{ display: "grid", justifyItems: "center", gap: 8 }}>
          {i === 10
            ? <div style={{ width: 112, height: 112, borderRadius: 28, background: "#fff", display: "grid", placeItems: "center", boxShadow: "0 6px 16px rgb(0 0 0 / .12)" }}><Mark size={78} id="home" /></div>
            : <div style={{ width: 112, height: 112, borderRadius: 28, background: ICON_TINTS[i % 5], display: "grid", placeItems: "center", fontSize: 56, boxShadow: "0 6px 16px rgb(0 0 0 / .1)" }}>{APPS[i % APPS.length]}</div>}
          <span style={{ fontFamily: ui, fontSize: 22, color: "#fff", fontWeight: 600, textShadow: "0 1px 4px rgb(0 0 0 / .3)", minHeight: 28 }}>{i === 10 ? "Skwirl" : ""}</span>
        </div>
      ))}
    </div>
    <Tap at={T.tap} x={SK_ICON.x} y={SK_ICON.y} size={120} />
    <StatusBar />
  </AbsoluteFill>
);
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const Keyboard: React.FC<{ down: string | null }> = ({ down }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 440, background: "#d6d3df", padding: "26px 8px 0", display: "grid", gap: 18, alignContent: "start" }}>
    {ROWS.map((r) => (
      <div key={r} style={{ display: "flex", justifyContent: "center", gap: 7 }}>
        {[...r].map((k) => (
          <div key={k} style={{ width: 49, height: 76, borderRadius: 10, background: k === down ? C.ink : "#fff", color: k === down ? "#fff" : "#111", display: "grid", placeItems: "center", fontSize: 34, fontFamily: SYS,
            transform: k === down ? "translateY(-10px) scale(1.25)" : undefined, boxShadow: "0 2px 0 rgb(0 0 0 / .18)" }}>{k}</div>
        ))}
      </div>
    ))}
  </div>
);
const Find: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const typed = "pasta".slice(0, KEYS.filter((k) => f >= k).length);
  const down = KEYS.findIndex((k) => f >= k && f < k + 5);
  const pop = spring({ frame: f - T.drop, fps, config: { damping: 11, stiffness: 170 } });
  const kbAway = prog(f, T.drop - 6, T.drop + 6);
  return (
    <AbsoluteFill style={{ background: C.bg, padding: "92px 30px 0", fontFamily: ui }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, ...D, fontSize: 44, color: C.ink }}><Mark size={46} id="fp" />Skwirl</div>
      <div style={{ marginTop: 26, height: 84, borderRadius: 999, background: "#fff", boxShadow: lift, display: "flex", alignItems: "center", padding: "0 30px", fontSize: 34, color: typed ? C.ink : C.muted }}>
        <Ico d={I.search} size={32} stroke={C.muted} />&nbsp;&nbsp;{typed || "Search your saves"}<span style={{ width: 3, height: 40, background: C.ink, marginLeft: 3, opacity: f > T.drop ? 0 : Math.floor(f / 8) % 2 }} />
      </div>
      <div style={{ marginTop: 34, borderRadius: 36, overflow: "hidden", background: "#fff", boxShadow: lift, opacity: Math.min(1, pop * 1.5), transform: `translateY(${(1 - pop) * 120}px) scale(${0.8 + 0.2 * pop})`, transformOrigin: "top center" }}>
        <div style={{ height: 430, background: `linear-gradient(160deg, ${C.peach}, ${C.butter})`, display: "grid", placeItems: "center", fontSize: 150, position: "relative" }}>
          🍝🧄<span style={{ position: "absolute", left: 18, top: 18, fontSize: 24, fontWeight: 500, padding: "6px 16px", borderRadius: 999, background: C.peach, color: C.peachInk }}>Unused</span>
        </div>
        <div style={{ padding: "20px 24px 26px" }}>
          <div style={{ fontWeight: 600, fontSize: 40, lineHeight: 1.2, color: C.ink }}>Garlic butter pasta in 15 minutes</div>
          <div style={{ fontSize: 28, color: C.muted, marginTop: 10 }}>Food · saved 3 months ago</div>
        </div>
      </div>
      <div style={{ opacity: 1 - kbAway, transform: `translateY(${kbAway * 300}px)` }}><Keyboard down={down >= 0 ? "pasta"[down] : null} /></div>
      <StatusBar />
    </AbsoluteFill>
  );
};

// ---------- 6. the note ----------
const INGREDIENTS = ["200g spaghetti", "4 cloves garlic, thinly sliced", "3 tbsp butter", "1 tsp chilli flakes"];
const Note: React.FC = () => {
  const f = useCurrentFrame();
  const scroll = prog(f, T.note + 10, T.note + 26) * 330;
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
          <div style={{ fontWeight: 600, fontSize: 30, marginTop: 34, color: C.ink }}>Next step</div>
          <div style={{ fontSize: 30, color: C.muted, marginTop: 12, lineHeight: 1.4 }}>Make it tonight. You probably have everything but the parmesan.</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- the film ----------
const Line: React.FC<{ show: boolean; children: React.ReactNode; top?: number }> = ({ show, children, top = 240 }) =>
  show ? <div style={{ position: "absolute", left: 60, right: 60, top, textAlign: "center" }}>{children}</div> : null;
const K = (c: unknown) => c as Caption[];

export const FridgePOV: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = spring({ frame: f - (T.pain - 14), fps, config: { damping: 15, stiffness: 110 } });
  const shake = f > T.truth - 30 && f < T.truth ? Math.sin(f * 2.4) * 11 : 0;
  const dim = prog(f, T.truth, T.truth + 12) * (1 - prog(f, T.flash - 8, T.flash));
  const flashDip = Math.max(1 - Math.abs(f - T.flash) / 6, 1 - Math.abs(f - T.now) / 6, 0);
  const toFind = prog(f, T.tap + 2, T.tap + 14, Easing.out(Easing.cubic));
  const toNote = prog(f, T.note, T.note + 12);
  const punch = spring({ frame: f - T.drop, fps, config: { damping: 9, stiffness: 140 } }) * (1 - prog(f, T.note, T.note + 20));
  const out = prog(f, T.cta - 6, T.cta + 14, Easing.in(Easing.cubic));
  const day = prog(f, T.cta - 4, T.cta + 14);
  const draw = prog(f, T.cta + 8, T.cta + 38);
  const fadeOut = prog(f, T.end - 10, T.end);
  const appZoom = 0.08 + 0.92 * toFind;
  return (
    <AbsoluteFill style={{ background: NIGHT }}>
      {f < T.pain + 30 && <Fridge />}
      <AbsoluteFill style={{ opacity: day }}><Ground /></AbsoluteFill>

      {f >= T.pain - 14 && f < T.cta + 16 && (
        <div style={{ position: "absolute", left: (1080 - 640) / 2 + shake, top: 580 + (1 - rise) * 1500 + out * 1400, transform: `scale(${1 + (f >= T.drop ? punch * 0.05 : 0) - dim * 0.03})`, transformOrigin: "50% 40%" }}>
          <Phone w={640} h={1300}>
            {f < T.flash && <AbsoluteFill style={{ filter: `blur(${dim * 7}px) brightness(${1 - dim * 0.6})` }}><SavedFlow frozen={f >= T.truth} /></AbsoluteFill>}
            {f >= T.flash && f < T.now && <AbsoluteFill style={{ filter: "sepia(.55) saturate(.75) contrast(1.05)" }}><Reel /></AbsoluteFill>}
            {f >= T.now && f < T.tap + 14 && <Home />}
            {f >= T.tap + 2 && (
              <AbsoluteFill style={{ transform: `scale(${appZoom})`, transformOrigin: `${SK_ICON.x}px ${SK_ICON.y}px`, opacity: Math.min(1, toFind * 2), borderRadius: 54 * (1 - toFind), overflow: "hidden" }}>
                <AbsoluteFill style={{ opacity: 1 - toNote }}><Find /></AbsoluteFill>
                {f >= T.note && <AbsoluteFill style={{ opacity: toNote }}><Note /></AbsoluteFill>}
              </AbsoluteFill>
            )}
            <AbsoluteFill style={{ background: "#000", opacity: flashDip * 0.85 }} />
          </Phone>
        </div>
      )}

      {/* words, on the voice's own timestamps */}
      <Line show={f < T.pain + 4}><Kinetic captions={K(v1)} voAt={VO.v1} breakAfter={[0, 2, 7]} style={{ color: "#fff", fontSize: 74, opacity: 1 - prog(f, T.pain - 6, T.pain + 4) }} /></Line>
      <Line show={f >= T.pain && f < T.truth}><Kinetic captions={K(v2)} voAt={VO.v2} breakAfter={[3, 6]} style={{ color: "#fff", fontSize: 72, opacity: 1 - prog(f, T.truth - 8, T.truth) }} /></Line>
      <Line show={f >= T.truth && f < T.flash} top={900}><Kinetic captions={K(v3)} voAt={VO.v3} breakAfter={[1, 5]} style={{ color: "#fff", fontSize: 92, opacity: 1 - prog(f, T.flash - 8, T.flash), textShadow: "0 6px 40px rgb(0 0 0 / .7)" }} /></Line>
      <Line show={f >= T.flash && f < T.now}>
        <div style={{ display: "inline-block", ...D, fontSize: 40, color: NIGHT, background: C.butter, padding: "10px 26px", borderRadius: 999, transform: `rotate(-3deg) scale(${spring({ frame: f - T.flash, fps, config: { damping: 10 } })})`, marginBottom: 20 }}>3 months ago</div>
        <Kinetic captions={K(v4)} voAt={VO.v4} breakAfter={[2]} style={{ color: "#fff", fontSize: 72, opacity: 1 - prog(f, T.now - 8, T.now) }} />
      </Line>
      <Line show={f >= T.tap + 16 && f < T.drop - 2}><div style={{ ...D, color: "#fff", fontSize: 120, opacity: prog(f, T.tap + 16, T.tap + 26) }}>…</div></Line>
      <Line show={f >= T.drop - 2 && f < T.note + 4}>
        <Kinetic captions={K(v5a)} voAt={VO.v5a} lead={0} style={{ color: "#fff", fontSize: 150 }} />
        <Kinetic captions={K(v5b)} voAt={VO.v5b} style={{ color: "#fff", fontSize: 76, opacity: 1 - prog(f, T.note - 6, T.note + 4) }} />
      </Line>
      <Line show={f >= T.note && f < T.cta}>
        <Kinetic captions={K(v6)} voAt={VO.v6} breakAfter={[1]} style={{ color: "#fff", fontSize: 70, opacity: 1 - prog(f, T.cta - 8, T.cta) }} />
      </Line>
      {f >= T.note + 4 && f < T.cta && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 432, textAlign: "center", fontFamily: ui, fontWeight: 600, fontSize: 32, color: NIGHT, opacity: prog(f, T.note + 30, T.note + 40) * (1 - prog(f, T.cta - 8, T.cta)), transform: `translateY(${(1 - prog(f, T.note + 30, T.note + 42)) * 14}px)` }}>
          <span style={{ background: C.butter, padding: "14px 28px", borderRadius: 999 }}>Saved 3 months ago · found in 2 seconds</span>
        </div>
      )}

      {/* the call to action: the name alone, a breath, then the promise */}
      {f >= T.cta - 2 && (
        <AbsoluteFill style={{ alignItems: "center", paddingTop: 470 }}>
          <div style={{ transform: `scale(${0.9 + 0.1 * draw})` }}><Mark size={280} draw={draw} acorn={prog(f, T.cta + 32, T.cta + 44, Easing.out(Easing.back(2.5)))} id="outro" /></div>
          <div style={{ ...D, fontSize: 150, color: C.ink, marginTop: 16, opacity: prog(f, VO.v7a - 2, VO.v7a + 8), transform: `scale(${0.92 + 0.08 * prog(f, VO.v7a - 2, VO.v7a + 10, Easing.out(Easing.back(2)))})` }}>Skwirl.</div>
          <div style={{ width: 920, textAlign: "center", marginTop: 26 }}>
            <Kinetic captions={K(v7b)} voAt={VO.v7b} breakAfter={[3, 10]} style={{ fontSize: 60 }} />
          </div>
          <div style={{ marginTop: 34, fontFamily: ui, fontWeight: 600, fontSize: 34, color: C.ink, opacity: prog(f, VO.v7b + 100, VO.v7b + 112), background: "rgb(255 255 255 / .8)", padding: "14px 30px", borderRadius: 999, boxShadow: lift }}>Free · skwirl.parthakholkar.com</div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: NIGHT, opacity: fadeOut }} />

      {/* sound */}
      <Audio src={staticFile("insta/sfx-hum.wav")} volume={0.5} />
      {sfx("sfx-thud.wav", 4, 0.9)}
      {[vo("f2-1", VO.v1), vo("f2-2", VO.v2), vo("f2-3", VO.v3), vo("f2-4", VO.v4), vo("f2-5a", VO.v5a), vo("f2-5b", VO.v5b), vo("f2-6", VO.v6), vo("f2-7a", VO.v7a), vo("f2-7b", VO.v7b)]}
      {sfx("sfx-click_001.ogg", T.allPosts, 0.5)}
      {FLICKS.map((at) => sfx("sfx-whoosh.wav", at - 2, 0.45))}
      {sfx("sfx-switch2.ogg", T.flash, 0.4)}
      {sfx("sfx-click_001.ogg", T.share, 0.6)}
      {sfx("sfx-click_001.ogg", T.pick, 0.7)}
      {sfx("sfx-select_008.ogg", T.pick + 8, 0.5)}
      {sfx("sfx-switch2.ogg", T.now, 0.4)}
      {sfx("sfx-click_001.ogg", T.tap, 0.7)}
      {KEYS.map((k) => sfx("sfx-click_001.ogg", k, 0.4))}
      {sfx("sfx-riser.wav", T.drop - 72, 0.45)}
      {sfx("sfx-drop_002.ogg", T.drop, 0.75)}
      {sfx("sfx-bong_001.ogg", T.note, 0.3)}
      {TICKS.map((t) => sfx("sfx-select_008.ogg", t, 0.5))}
      {/* music bed from 7s, low under the story, dips for the truth line, full at the drop */}
      <Sequence from={210} layout="none">
        <Audio src={staticFile("launch/music-vol1.mp3")}
          volume={(fr) => interpolate(fr + 210, [210, 240, T.truth, T.truth + 10, T.flash - 10, T.flash, T.drop - 2, T.drop, T.end - 30, T.end], [0, 0.11, 0.11, 0.04, 0.04, 0.11, 0.11, 0.33, 0.33, 0], { extrapolateRight: "clamp" })} />
      </Sequence>
    </AbsoluteFill>
  );
};
