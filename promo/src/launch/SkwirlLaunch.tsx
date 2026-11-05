import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, interpolateColors, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { C, D, Ground, Kinetic, lift, Mark, Pill, prog, Tap, ui, useInOut } from "./kit";
import hook from "./captions/lv-1-hook.json";
import share from "./captions/lv-3-share.json";
import noteVo from "./captions/lv-4-note.json";
import lists from "./captions/lv-5-lists.json";
import claude from "./captions/lv-6-claude.json";
import outro from "./captions/lv-7-outro.json";

// 30fps on the music's 120 BPM grid: a beat is 15 frames, a bar 60. Every scene starts on a beat.
const S = { hook: 0, reveal: 120, share: 210, note: 360, lists: 540, claude: 690, outro: 810, end: 930 };
const VO = { hook: 8, meet: 150, share: 214, note: 364, lists: 546, claude: 706, outro: 820 };
const cap = (c: unknown) => c as Caption[];
// One file, two cuts: the 1920x1080 launch video and the 1080x1920 Reel. Only layout differs by `tall`;
// every timing, voice line and sound is shared, so the two can't drift apart.
const useTall = () => { const { width, height } = useVideoConfig(); return height > width; };
const f_ = (n: string) => staticFile(`launch/${n}`);

// ---------- 1. hook: the Saved folder graveyard ----------
const TILES = ["🍝", "📚", "✈️", "🎬", "💸", "🧘", "☕", "🎧", "📍", "🧁", "🏋️", "🪴", "🍜", "🎨", "🛍️", "📸"];
const TINTS = [C.butter, C.lavender, C.sky, C.peach, C.mint];
const Wall: React.FC = () => {
  const f = useCurrentFrame();
  const tall = useTall();
  const dead = prog(f, 52, 80); // "never see it again": the wall goes grey and sinks back
  const exit = prog(f, 108, 124, Easing.in(Easing.cubic));
  return (
    <AbsoluteFill style={{ perspective: 1600, opacity: 1 - exit }}>
      <div style={{ position: "absolute", left: tall ? -320 : -260, top: tall ? -220 : -160, width: tall ? 1720 : 2440, display: "grid", gridTemplateColumns: `repeat(${tall ? 7 : 12}, 1fr)`, gap: 22,
        transform: `rotateX(28deg) rotateZ(-9deg) translateY(${-f * 1.6}px) scale(${1 + exit * 0.25})`, transformOrigin: "50% 30%",
        filter: `grayscale(${dead}) blur(${dead * 2.5}px)`, opacity: 1 - dead * 0.45 }}>
        {Array.from({ length: 60 }, (_, i) => {
          const at = 2 + ((i * 7) % 60) * 0.55;
          const s = prog(f, at, at + 10, Easing.out(Easing.back(1.6)));
          return (
            <div key={i} style={{ aspectRatio: "9 / 16", borderRadius: 22, background: `linear-gradient(160deg, ${TINTS[i % 5]}, #fff)`, boxShadow: lift, display: "grid", placeItems: "center", fontSize: 64,
              opacity: s, transform: `scale(${0.6 + s * 0.4})`, position: "relative" }}>
              {TILES[(i * 5) % TILES.length]}
              <span style={{ position: "absolute", left: 14, bottom: 12, fontFamily: ui, fontWeight: 600, fontSize: 18, color: C.muted }}>▶ Reel</span>
              <span style={{ position: "absolute", right: 14, top: 12, width: 16, height: 20, background: C.ink, clipPath: "polygon(0 0,100% 0,100% 100%,50% 72%,0 100%)", opacity: 0.75 }} />
            </div>
          );
        })}
      </div>
      <AbsoluteFill style={{ background: `radial-gradient(60% 55% at 50% 50%, ${C.bg} 30%, rgb(248 247 255 / 0) 100%)` }} />
    </AbsoluteFill>
  );
};
const Hook: React.FC = () => {
  const out = useInOut(0, 108, 30);
  const tall = useTall();
  return (
    <AbsoluteFill>
      <Wall />
      <AbsoluteFill style={{ display: "grid", placeItems: "center", ...out, transform: undefined, opacity: out.opacity }}>
        <Kinetic captions={cap(hook)} voAt={VO.hook} breakAfter={tall ? [1, 3, 6] : [3]} style={{ fontSize: tall ? 112 : 132, textAlign: "center" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- 2. reveal: the tail draws itself, the acorn drops in ----------
const Reveal: React.FC = () => {
  const f = useCurrentFrame() + S.reveal;
  const { fps } = useVideoConfig();
  const draw = prog(f, 124, 160, Easing.inOut(Easing.cubic));
  const acorn = spring({ frame: f - 158, fps, config: { damping: 9, stiffness: 180 } });
  const word = spring({ frame: f - 166, fps, config: { damping: 16 } });
  const out = prog(f, 200, 210, Easing.in(Easing.cubic));
  const tall = useTall();
  return (
    <AbsoluteFill style={{ display: "grid", placeItems: "center", opacity: 1 - out, transform: `scale(${1 - out * 0.06})` }}>
      <div style={{ display: "flex", flexDirection: tall ? "column" : "row", alignItems: "center", gap: tall ? 30 : 40,
        transform: tall ? `translateY(${(1 - word) * 120}px)` : `translateX(${(1 - word) * 150}px)` }}>
        <Mark id="reveal" size={tall ? 340 : 280} draw={draw} acorn={f >= 158 ? acorn : 0} />
        <div style={{ ...D, fontSize: tall ? 210 : 250, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1, clipPath: `inset(-20% ${(1 - word) * 100}% -20% 0)` }}>Skwirl</div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 3. share: the reel fills the frame, then every reel flies into the stash ----------
const Rail: React.FC = () => (
  <div style={{ position: "absolute", right: 14, bottom: 150, display: "flex", flexDirection: "column", alignItems: "center", gap: 22, color: "#fff", fontSize: 13, fontWeight: 600 }}>
    {[["M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 5a5.5 5.5 0 0 1 9.5 7c-2.5 4.5-9.5 9-9.5 9z", "12.4K"], ["M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z", "318"], ["M22 3 11 14M22 3l-7 19-4-8-8-4z", "2,041"]].map(([d, n], i) => (
      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill={i === 0 ? "#ff3040" : "none"} stroke={i === 0 ? "#ff3040" : "#fff"} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"><path d={d} /></svg>{n}
      </div>
    ))}
  </div>
);
const REEL_BG = "radial-gradient(120% 70% at 50% 40%, #6b5444, #3a2d26 55%, #1f1814)";
const Reel: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ position: "absolute", inset: 0, background: REEL_BG, color: "#fff", fontFamily: "-apple-system, system-ui, sans-serif" }}>
    <div style={{ position: "absolute", left: 0, right: 0, top: 250, textAlign: "center", fontSize: 170, transform: `rotate(${Math.sin(f / 9) * 4}deg) translateY(${Math.sin(f / 6) * 4}px)` }}>🍝</div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 480, textAlign: "center", font: "800 38px/1.1 -apple-system, system-ui", textShadow: "0 2px 0 #000, 0 0 14px rgb(0 0 0 / .5)" }}>15 MIN PASTA 🍝</div>
    <div style={{ position: "absolute", top: 34, left: 24, right: 24, display: "flex", justifyContent: "space-between", fontSize: 28, fontWeight: 700 }}><span>Reels</span><span>⌁</span></div>
    <Rail />
    <div style={{ position: "absolute", left: 20, right: 84, bottom: 40, fontSize: 18, lineHeight: 1.35 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: C.peach, boxShadow: "0 0 0 2px #2a211d, 0 0 0 4px #e1306c" }} />
        <b>pastaqueen</b><span style={{ border: "1px solid rgb(255 255 255 / .7)", borderRadius: 8, padding: "2px 10px", fontSize: 15 }}>Follow</span>
      </div>
      15 min garlic butter pasta 🧄 full recipe in the comments…
    </div>
  </div>
);
const Sheet: React.FC<{ up: number; picked: boolean; tapAt: number }> = ({ up, picked, tapAt }) => (
  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#f2f2f7", color: "#111", borderRadius: "30px 30px 0 0", padding: "20px 18px 44px", fontFamily: "-apple-system, system-ui, sans-serif", transform: `translateY(${(1 - up) * 105}%)` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: "1px solid #ddd", marginBottom: 16 }}>
      <span style={{ width: 52, height: 52, borderRadius: 10, background: "linear-gradient(135deg,#6b5444,#2a211d)" }} />
      <div style={{ flex: 1 }}><b style={{ display: "block", fontSize: 18 }}>instagram.com</b><span style={{ fontSize: 15, color: "#8e8e93" }}>Reel by pastaqueen</span></div>
    </div>
    <div style={{ background: "#fff", borderRadius: 14 }}>
      {["Copy", "Skwirl", "Add to Reading List"].map((n) => (
        <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "17px 18px", fontSize: 21, borderBottom: n === "Add to Reading List" ? 0 : "1px solid #e5e5ea", background: n === "Skwirl" && picked ? "#e5e5ea" : "transparent", position: "relative", fontWeight: n === "Skwirl" ? 600 : 400 }}>
          {n}
          {n === "Skwirl" ? <span style={{ width: 34, height: 34, borderRadius: 8, background: C.lavender, display: "grid", placeItems: "center" }}><Mark id="sheet" size={28} /></span> : <span style={{ color: "#8e8e93" }}>⧉</span>}
          {n === "Skwirl" ? <Tap at={tapAt} x={80} y={32} dark /> : null}
        </div>
      ))}
    </div>
  </div>
);
// Reels from everywhere, spiralling into the mark ("any reel"). [emoji, platform, tint]
// Only platforms verified end to end (2026-11-05): Instagram, YouTube, X.
const FLY: [string, string, string][] = [["📚", "YouTube", C.lavender], ["✈️", "Instagram", C.sky], ["🧘", "X", C.mint], ["🎬", "YouTube", C.peach], ["☕", "Instagram", C.butter],
  ["💸", "X", C.mint], ["📍", "Instagram", C.lavender], ["🎧", "YouTube", C.peach], ["🧁", "X", C.sky], ["🪴", "Instagram", C.butter]];
const ShareScene: React.FC = () => {
  const f = useCurrentFrame() + S.share;
  const { fps } = useVideoConfig();
  const tall = useTall();
  const [MX, MY] = tall ? [540, 900] : [960, 640]; // where the mark sits
  const [CW, CH] = tall ? [640, 1138] : [520, 924]; // the hero reel card
  const dark = 1 - prog(f, 262, 284);
  const cardIn = spring({ frame: f - S.share, fps, config: { damping: 18, stiffness: 120 } });
  const up = prog(f, 232, 244) * (1 - prog(f, 258, 266));
  const fly = prog(f, 262, 288, Easing.inOut(Easing.cubic)); // the hero reel shrinks into the mark
  const mark = spring({ frame: f - 266, fps, config: { damping: 11, stiffness: 160 } });
  const catches = FLY.map((_, i) => 272 + i * 4 + 22);
  const pulse = Math.max(0, ...[288, ...catches].map((c) => (f >= c ? 1 - prog(f, c, c + 9) : 0)));
  const saved = spring({ frame: f - 326, fps, config: { damping: 13 } });
  const iris = prog(f, 342, 362, Easing.in(Easing.cubic));
  const txt = interpolateColors(f, [262, 280], ["#ffffff", C.ink]);
  const cx = interpolate(fly, [0, 1], [MX, MX]), cy = interpolate(fly, [0, 1], [tall ? 1050 : 700, MY]) - Math.sin(fly * Math.PI) * 120;
  return (
    <AbsoluteFill>
      {/* full-bleed reel world: the reel's own blurred colours fill the frame */}
      <AbsoluteFill style={{ background: REEL_BG, opacity: dark }}>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 900, filter: "blur(70px)", opacity: 0.5, transform: `scale(${1.1 + (f - S.share) * 0.002})` }}>🍝</div>
      </AbsoluteFill>
      {FLY.map(([e, p, tint], i) => {
        const at = 272 + i * 4, t = prog(f, at, at + 22, Easing.in(Easing.quad));
        if (f < at || t >= 1) return null;
        const ang = (i * 137.5 * Math.PI) / 180, r = 1250 * (1 - t);
        const swirl = Math.sin(t * Math.PI) * 260;
        const x = MX + Math.cos(ang) * r - Math.sin(ang) * swirl, y = MY + Math.sin(ang) * r * 0.62 + Math.cos(ang) * swirl * 0.62;
        return (
          <div key={i} style={{ position: "absolute", left: x - 85, top: y - 150, width: 170, height: 300, borderRadius: 24, background: `linear-gradient(160deg, ${tint}, #fff)`, boxShadow: lift,
            display: "grid", placeItems: "center", fontSize: 72, transform: `scale(${1 - t * 0.85}) rotate(${(1 - t) * (i % 2 ? 24 : -24)}deg)` }}>
            {e}
            <span style={{ position: "absolute", left: 12, bottom: 12, background: "#fff", borderRadius: 999, padding: "4px 12px", fontFamily: ui, fontWeight: 600, fontSize: 17, color: C.ink }}>{p}</span>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: MX - 150, top: MY - 150, transform: `scale(${mark * (1 + pulse * 0.12)})`, opacity: f >= 266 ? 1 : 0 }}>
        <div style={{ width: 300, height: 300, borderRadius: 84, background: "#fff", boxShadow: lift, display: "grid", placeItems: "center" }}><Mark id="stash" size={200} /></div>
      </div>
      {/* the hero reel: share sheet, tap Skwirl, then it flies into the mark */}
      <div style={{ position: "absolute", left: cx - CW / 2, top: cy - CH / 2, width: CW, height: CH, borderRadius: 44, overflow: "hidden", boxShadow: "0 50px 100px rgb(0 0 0 / .35)",
        opacity: fly < 0.97 ? 1 : 0, transform: `translateY(${(1 - cardIn) * 700}px) scale(${1 - fly * 0.9}) rotate(${(1 - cardIn) * 6 + fly * -14}deg)` }}>
        <Reel f={f} />
        <Sheet up={up} picked={f >= 250 && f < 258} tapAt={252 - S.share} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: tall ? 220 : 70, textAlign: "center" }}>
        <Kinetic captions={cap(share)} voAt={VO.share - S.share} breakAfter={tall ? [1] : []} style={{ fontSize: tall ? 104 : 124, color: txt, textShadow: dark > 0.5 ? "0 4px 30px rgb(0 0 0 / .35)" : "none" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: MY + 190, display: "flex", justifyContent: "center", opacity: Math.min(1, saved * 1.4), transform: `translateY(${(1 - saved) * 30}px)` }}>
        <Pill bg={C.mint} style={{ height: 64, fontSize: 30 }}>✓ Saved to Skwirl</Pill>
      </div>
      {/* dive into the stash: an ink circle opens out of the mark */}
      <div style={{ position: "absolute", left: MX - 1, top: MY - 1, width: 2, height: 2, borderRadius: "50%", background: C.ink, transform: `scale(${iris * 2400})` }} />
    </AbsoluteFill>
  );
};

// ---------- 4. it reads the whole thing: the reel comes apart into layers, then folds into the note ----------
const Wave: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
    {Array.from({ length: 22 }, (_, i) => (
      <span key={i} style={{ width: 8, borderRadius: 4, background: C.lavender, height: 30 + Math.abs(Math.sin(f / 4 + i * 0.7)) * 150 * (0.4 + 0.6 * Math.abs(Math.sin(i * 1.3))) }} />
    ))}
  </div>
);
const LAYERS: [string, (f: number) => React.ReactNode, string][] = [
  ["🎞 Frames", (f) => <><div style={{ position: "absolute", inset: 0, background: REEL_BG }} /><div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 140, transform: `rotate(${Math.sin(f / 9) * 4}deg)` }}>🍝</div></>, "transparent"],
  ["🔤 On-screen text", () => <div style={{ position: "absolute", left: 0, right: 0, top: 380, textAlign: "center", font: "800 32px/1.2 -apple-system, system-ui", color: "#fff" }}>15 MIN PASTA 🍝<br />4 cloves garlic 🧄</div>, "rgb(255 255 255 / .05)"],
  ["🔊 Audio", (f) => <Wave f={f} />, "rgb(255 255 255 / .06)"],
  ["💬 Caption + comments", () => (
    <div style={{ position: "absolute", left: 18, right: 18, bottom: 26, display: "flex", flexDirection: "column", gap: 10, fontFamily: ui, fontSize: 19, color: "#fff" }}>
      {["15 min garlic butter pasta 🧄 full recipe in the comments…", "sam: low heat is the whole trick", "ria: 200g feeds two"].map((t, i) => (
        <span key={i} style={{ background: i ? "rgb(255 255 255 / .14)" : "rgb(255 255 255 / .22)", borderRadius: 16, padding: "10px 14px" }}>{t}</span>
      ))}
    </div>
  ), "rgb(255 255 255 / .07)"],
];
const ReadScene: React.FC = () => {
  const f = useCurrentFrame() + S.note;
  const { fps } = useVideoConfig();
  const tall = useTall();
  // Portrait has no room for labels beside the stack, so it fans the other way and labels sit on the left.
  const [SX, SY, LW, LH, NW, NT] = tall ? [540, 1000, 380, 676, 640, 560] : [960, 640, 340, 604, 560, 268];
  const turn = prog(f, 362, 390), spread = prog(f, 372, 394) * (1 - prog(f, 408, 424, Easing.in(Easing.cubic)));
  const rot = interpolate(turn, [0, 1], [0, tall ? 38 : -38]) * (1 - prog(f, 408, 426));
  const stackOut = prog(f, 420, 430);
  const card = spring({ frame: f - 420, fps, config: { damping: 16, stiffness: 120 } });
  const scroll = prog(f, 452, 506, Easing.inOut(Easing.cubic)) * 0.42;
  const H = NW * (2196 / 540);
  const part1 = 1 - prog(f, 406, 414);
  const leave = prog(f, 530, 545, Easing.in(Easing.cubic));
  return (
    <AbsoluteFill style={{ background: C.ink, opacity: 1 - leave }}>
      <AbsoluteFill style={{ background: "radial-gradient(50% 60% at 50% 62%, rgb(220 216 255 / .16), transparent 70%)" }} />
      <div style={{ position: "absolute", left: SX - LW / 2, top: SY - LH / 2, width: LW, height: LH, perspective: 1900, opacity: 1 - stackOut }}>
        <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: `rotateX(${turn * 12}deg) rotateY(${rot}deg)` }}>
          {LAYERS.map(([label, body, bg], i) => {
            const scanAt = 390 + i * 5, scanned = f >= scanAt + 8;
            const sx = prog(f, scanAt, scanAt + 8);
            return (
              <div key={i} style={{ position: "absolute", inset: 0, borderRadius: 34, overflow: "visible", transform: `translateZ(${(i - 1.5) * spread * 170}px)` }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: 34, overflow: "hidden", background: bg, border: i ? `2px solid rgb(220 216 255 / ${0.15 + spread * 0.35})` : 0 }}>
                  {body(f)}
                  {f >= scanAt && f < scanAt + 9 ? <div style={{ position: "absolute", top: 0, bottom: 0, left: `${sx * 100}%`, width: 70, marginLeft: -35, background: "linear-gradient(90deg, transparent, rgb(255 122 89 / .65), transparent)" }} /> : null}
                </div>
                <div style={{ position: "absolute", ...(tall ? { right: LW + 20 } : { left: LW + 20 }), top: 24 + i * 6, opacity: spread, whiteSpace: "nowrap" }}>
                  <Pill bg={scanned ? C.mint : "rgb(255 255 255 / .92)"} style={{ height: 50, fontSize: 24 }}>{label}{scanned ? " ✓" : ""}</Pill>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {/* the note it hands you: the real screenshot, no phone around it */}
      <div style={{ position: "absolute", left: SX - NW / 2, top: NT, width: NW, height: tall ? 1100 : 900, perspective: 1600, opacity: Math.min(1, card * 1.5) }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: 40, overflow: "hidden", background: C.bg, boxShadow: "0 40px 120px rgb(0 0 0 / .5)",
          transform: `rotateY(${(1 - card) * 70 + interpolate(f, [420, 540], [10, -8])}deg) translateY(${(1 - card) * 60 + leave * -80}px) scale(${0.85 + card * 0.15 + leave * 0.2})` }}>
          <Img src={f_("note.webp")} style={{ position: "absolute", left: 0, top: 0, width: "100%", transform: `translateY(${-scroll * H}px)` }} />
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: tall ? 250 : 70, textAlign: "center", opacity: part1 }}>
        <Kinetic captions={cap(noteVo).slice(0, 5)} voAt={VO.note - S.note} breakAfter={tall ? [1] : []} style={{ fontSize: tall ? 100 : 112, color: "#fff" }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: tall ? 230 : 44, textAlign: "center" }}>
        <Kinetic captions={cap(noteVo).slice(5)} voAt={VO.note - S.note} breakAfter={tall ? [2, 5] : [4]} style={{ fontSize: tall ? 84 : 88, color: "#fff", lineHeight: 1.04 }} />
      </div>
    </AbsoluteFill>
  );
};

// ---------- 5. recipes fan out into steps; books and movies drop onto a shelf ----------
const STEPS = ["Boil the spaghetti", "Garlic in butter, low and slow", "Add the chilli flakes", "Toss with pasta water", "Parmesan and parsley"];
const COVERS: [string, string, string, string][] = [["Deep Work", "Book", "📖", C.lavender], ["Past Lives", "Movie", "🎬", C.peach], ["Atomic Habits", "Book", "📗", C.mint],
  ["Perfect Days", "Movie", "🌳", C.butter], ["Four Thousand Weeks", "Book", "⏳", C.sky], ["Aftersun", "Movie", "☀️", "#ffc9b8"]];
const ListScene: React.FC = () => {
  const f = useCurrentFrame() + S.lists;
  const { fps } = useVideoConfig();
  const tall = useTall();
  // Portrait: a tighter fan, and the six covers on two shelves of three.
  const [SW, SH, SP, ST] = tall ? [210, 300, 195, 820] : [300, 400, 250, 420];
  const [CVW, CVH, GAP] = tall ? [240, 350, 30] : [228, 330, 26];
  const shelves = tall ? [960, 1340] : [846];
  const perRow = tall ? 3 : 6;
  const fanOut = prog(f, 594, 608, Easing.in(Easing.cubic));
  const part1 = 1 - prog(f, 596, 604);
  const shelf = prog(f, 616, 632);
  const count = spring({ frame: f - 664, fps, config: { damping: 14 } });
  const leave = prog(f, 680, 692, Easing.in(Easing.cubic));
  return (
    <AbsoluteFill style={{ opacity: 1 - leave }}>
      {STEPS.map((t, i) => {
        const s = spring({ frame: f - 556 - i * 3, fps, config: { damping: 13, stiffness: 140 } });
        const k = i - 2;
        return (
          <div key={i} style={{ position: "absolute", left: (tall ? 540 : 960) - SW / 2, top: ST, width: SW, height: SH, borderRadius: 32, background: "#fff", boxShadow: lift, padding: tall ? "24px 20px" : "30px 28px", boxSizing: "border-box",
            transform: `translate(${k * SP * s}px, ${Math.abs(k) * 36 * s + fanOut * 1400}px) rotate(${k * (tall ? 9 : 10) * s + fanOut * k * 12}deg)`, opacity: Math.min(1, s * 2) }}>
            <div style={{ ...D, fontSize: tall ? 88 : 120, lineHeight: 1, color: C.coral }}>{i + 1}</div>
            <div style={{ fontFamily: ui, fontWeight: 600, fontSize: tall ? 26 : 32, lineHeight: 1.2, color: C.ink, marginTop: tall ? 26 : 40 }}>{t}</div>
          </div>
        );
      })}
      {shelves.map((y) => (
        <div key={y} style={{ position: "absolute", left: tall ? 90 : 180, right: tall ? 90 : 180, top: y, height: 8, borderRadius: 4, background: "rgb(29 27 46 / .12)", transform: `scaleX(${shelf})` }} />
      ))}
      {COVERS.map(([t, k, e, tint], i) => {
        const row = Math.floor(i / perRow), col = i % perRow;
        const at = 618 + col * 4 + row * 6; // the first shelf lands on "land", the second right after
        const s = spring({ frame: f - at, fps, config: { damping: 10, stiffness: 150, mass: 0.8 } });
        if (f < at) return null;
        return (
          <div key={t} style={{ position: "absolute", left: (tall ? 540 : 960) - (perRow * CVW + (perRow - 1) * GAP) / 2 + col * (CVW + GAP), top: shelves[row] - CVH, width: CVW, height: CVH, borderRadius: 16, background: tint, boxShadow: lift, padding: 20, boxSizing: "border-box",
            transform: `translateY(${(1 - s) * -1000}px) rotate(${(1 - s) * (i % 2 ? 14 : -14)}deg)`, transformOrigin: "50% 100%" }}>
            <div style={{ fontFamily: ui, fontWeight: 600, fontSize: 16, letterSpacing: ".12em", textTransform: "uppercase", color: "rgb(29 27 46 / .55)" }}>{k}</div>
            <div style={{ ...D, fontSize: 36, lineHeight: 1.05, color: C.ink, marginTop: 14 }}>{t}</div>
            <div style={{ position: "absolute", right: 18, bottom: 14, fontSize: 64 }}>{e}</div>
          </div>
        );
      })}
      <div style={{ position: "absolute", left: 0, right: 0, top: tall ? 1390 : 890, display: "flex", justifyContent: "center", opacity: Math.min(1, count * 1.4), transform: `translateY(${(1 - count) * 24}px)` }}>
        <Pill style={{ height: 60, fontSize: 28 }}>📚 3 books · 🎬 3 movies · saved to Lists</Pill>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: tall ? 260 : 80, textAlign: "center", opacity: part1 }}>
        <Kinetic captions={cap(lists).slice(0, 3)} voAt={VO.lists - S.lists} breakAfter={tall ? [0] : []} style={{ fontSize: tall ? 116 : 132 }} />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: tall ? 250 : 64, textAlign: "center" }}>
        <Kinetic captions={cap(lists).slice(3)} voAt={VO.lists - S.lists} breakAfter={[2]} style={{ fontSize: tall ? 96 : 112 }} />
      </div>
    </AbsoluteFill>
  );
};
const Story: React.FC = () => (
  <AbsoluteFill>
    <Sequence from={S.lists - S.share} durationInFrames={S.claude - S.lists}><ListScene /></Sequence>
    <Sequence durationInFrames={S.note - S.share + 2}><ShareScene /></Sequence>
    <Sequence from={S.note - S.share} durationInFrames={186}><ReadScene /></Sequence>
  </AbsoluteFill>
);

// ---------- 6. Claude searches it ----------
const Q = "What was that pasta recipe I saved?";
const A = "The garlic butter one. 200g spaghetti, 4 cloves garlic, 3 tbsp butter, chilli flakes. Cook the garlic low and slow so it goes sweet, not bitter.";
const Claude: React.FC = () => {
  const f = useCurrentFrame() + 660; // timings below are written against a 660 start
  const { fps } = useVideoConfig();
  const win = spring({ frame: f - 662, fps, config: { damping: 18, stiffness: 120 } });
  const out = prog(f, 770, 780, Easing.in(Easing.cubic));
  const typed = Q.slice(0, Math.floor(interpolate(f, [676, 700], [0, Q.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const searching = f >= 704 && f < 718, found = f >= 718;
  const answer = A.slice(0, Math.floor(interpolate(f, [720, 762], [0, A.length], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
  const tall = useTall();
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <div style={{ position: "absolute", top: tall ? 300 : 96, left: 0, right: 0, textAlign: "center" }}>
        <Kinetic captions={cap(claude)} voAt={VO.claude - S.claude} breakAfter={tall ? [2] : []} style={{ fontSize: tall ? 92 : 96 }} />
      </div>
      <div style={{ position: "absolute", left: "50%", top: tall ? 620 : 300, width: tall ? 960 : 1180, marginLeft: tall ? -480 : -590, background: "#fff", borderRadius: 36, boxShadow: lift, padding: "34px 44px 40px", fontFamily: ui, opacity: win, transform: `translateY(${(1 - win) * 80}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.muted, fontSize: 22, fontWeight: 500, marginBottom: 26 }}>
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: "#d97757" }} />Claude
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 22 }}>
          <div style={{ background: C.ink, color: "#fff", borderRadius: "26px 26px 8px 26px", padding: "16px 24px", fontSize: 30, minHeight: 72, minWidth: 60 }}>{typed}{f < 700 && Math.floor(f / 8) % 2 ? "|" : ""}</div>
        </div>
        {f >= 704 ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: C.bg, borderRadius: 999, padding: "8px 18px", fontSize: 22, fontWeight: 600, color: "#3d3577", marginBottom: 16 }}>
            {found ? "✓" : <span style={{ display: "inline-block", width: 18, height: 18, borderRadius: "50%", border: "3px solid #cfc9fb", borderTopColor: "#3d3577", transform: `rotate(${f * 24}deg)` }} />}
            {searching ? "Searching Skwirl…" : "Searched Skwirl · 1 note"}
          </div>
        ) : null}
        <div style={{ fontSize: tall ? 34 : 30, lineHeight: 1.45, color: C.ink, minHeight: tall ? 260 : 130 }}>{answer}</div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 7. outro ----------
const Outro: React.FC = () => {
  const f = useCurrentFrame() + 780; // timings below are written against a 780 start
  const { fps } = useVideoConfig();
  const lock = spring({ frame: f - 782, fps, config: { damping: 16, stiffness: 110 } });
  const url = spring({ frame: f - 840, fps, config: { damping: 15 } });
  const tall = useTall();
  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: tall ? 44 : 34 }}>
      <div style={{ display: "flex", flexDirection: tall ? "column" : "row", alignItems: "center", gap: tall ? 20 : 26, opacity: lock, transform: `scale(${0.85 + lock * 0.15})` }}>
        <Mark id="outro" size={tall ? 220 : 150} />
        <span style={{ ...D, fontSize: tall ? 180 : 150, letterSpacing: "-0.02em", color: C.ink, lineHeight: 1 }}>Skwirl</span>
      </div>
      <Kinetic captions={cap(outro)} voAt={VO.outro - S.outro} skip={1} breakAfter={tall ? [4] : []} style={{ fontSize: tall ? 80 : 76, textAlign: "center" }} />
      <div style={{ display: "flex", gap: 16, opacity: url, transform: `translateY(${(1 - url) * 24}px)` }}>
        <Pill bg={C.ink} color="#fff" style={{ height: 70, fontSize: 30, padding: "0 32px" }}>skwirl.parthakholkar.com</Pill>
      </div>
    </AbsoluteFill>
  );
};

// ---------- sound ----------
const Sfx: React.FC<{ at: number; src: string; vol?: number }> = ({ at, src, vol = 0.35 }) => (
  <Sequence from={at} layout="none"><Audio src={f_(src)} volume={vol} /></Sequence>
);
const Vo: React.FC<{ at: number; src: string }> = ({ at, src }) => (
  <Sequence from={at} layout="none"><Audio src={f_(src)} volume={1} /></Sequence>
);

export const SkwirlLaunch: React.FC = () => (
  <AbsoluteFill style={{ background: C.bg }}>
    <Ground />
    <Sequence from={S.hook} durationInFrames={S.reveal + 6}><Hook /></Sequence>
    <Sequence from={S.reveal} durationInFrames={S.share - S.reveal}><Reveal /></Sequence>
    <Sequence from={S.share} durationInFrames={S.claude - S.share}><Story /></Sequence>
    <Sequence from={S.claude} durationInFrames={S.outro - S.claude}><Claude /></Sequence>
    <Sequence from={S.outro}><Outro /></Sequence>

    {/* music ducks a little under the voice, fades out on the last bar */}
    <Audio src={f_("music-vol1.mp3")} volume={(fr) => interpolate(fr, [0, 8, S.end - 40, S.end], [0, 0.32, 0.32, 0], { extrapolateRight: "clamp" })} />
    <Vo at={VO.hook} src="lv-1-hook.wav" /><Vo at={VO.meet} src="lv-2-meet.wav" /><Vo at={VO.share} src="lv-3-share.wav" />
    <Vo at={VO.note} src="lv-4-note.wav" /><Vo at={VO.lists} src="lv-5-lists.wav" /><Vo at={VO.claude} src="lv-6-claude.wav" /><Vo at={VO.outro} src="lv-7-outro.wav" />
    <Sfx at={160} src="sfx-drop_002.ogg" vol={0.45} />
    <Sfx at={252} src="sfx-click_001.ogg" /><Sfx at={288} src="sfx-select_008.ogg" vol={0.3} /><Sfx at={326} src="sfx-select_008.ogg" vol={0.25} />
    <Sfx at={392} src="sfx-switch2.ogg" vol={0.2} /><Sfx at={632} src="sfx-drop_002.ogg" vol={0.3} /><Sfx at={648} src="sfx-drop_002.ogg" vol={0.2} />
    <Sfx at={735} src="sfx-switch2.ogg" vol={0.25} /><Sfx at={748} src="sfx-select_008.ogg" vol={0.25} />
    <Sfx at={812} src="sfx-bong_001.ogg" vol={0.25} />
  </AbsoluteFill>
);
