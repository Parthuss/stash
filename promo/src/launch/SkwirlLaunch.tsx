import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { C, display, Ground, Kinetic, lift, Mark, Phone, Pill, prog, Tap, ui, useInOut } from "./kit";
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
const f_ = (n: string) => staticFile(`launch/${n}`);

// ---------- 1. hook: the Saved folder graveyard ----------
const TILES = ["🍝", "📚", "✈️", "🎬", "💸", "🧘", "☕", "🎧", "📍", "🧁", "🏋️", "🪴", "🍜", "🎨", "🛍️", "📸"];
const TINTS = [C.butter, C.lavender, C.sky, C.peach, C.mint];
const Wall: React.FC = () => {
  const f = useCurrentFrame();
  const dead = prog(f, 52, 80); // "never see it again": the wall goes grey and sinks back
  const exit = prog(f, 108, 124, Easing.in(Easing.cubic));
  return (
    <AbsoluteFill style={{ perspective: 1600, opacity: 1 - exit }}>
      <div style={{ position: "absolute", left: -260, top: -160, width: 2440, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 22,
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
  return (
    <AbsoluteFill>
      <Wall />
      <AbsoluteFill style={{ display: "grid", placeItems: "center", ...out, transform: undefined, opacity: out.opacity }}>
        <Kinetic captions={cap(hook)} voAt={VO.hook} breakAfter={[3]} style={{ fontSize: 132, textAlign: "center" }} />
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
  return (
    <AbsoluteFill style={{ display: "grid", placeItems: "center", opacity: 1 - out, transform: `scale(${1 - out * 0.06})` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 40, transform: `translateX(${(1 - word) * 150}px)` }}>
        <Mark id="reveal" size={280} draw={draw} acorn={f >= 158 ? acorn : 0} />
        <div style={{ fontFamily: display, fontSize: 250, letterSpacing: "-0.035em", color: C.ink, lineHeight: 1, clipPath: `inset(-20% ${(1 - word) * 100}% -20% 0)` }}>Skwirl</div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- 3–5. the phone: reel → share → saved → note → lists ----------
const Rail: React.FC = () => (
  <div style={{ position: "absolute", right: 14, bottom: 150, display: "flex", flexDirection: "column", alignItems: "center", gap: 22, color: "#fff", fontSize: 13, fontWeight: 600 }}>
    {[["M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 5a5.5 5.5 0 0 1 9.5 7c-2.5 4.5-9.5 9-9.5 9z", "12.4K"], ["M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z", "318"], ["M22 3 11 14M22 3l-7 19-4-8-8-4z", "2,041"]].map(([d, n], i) => (
      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill={i === 0 ? "#ff3040" : "none"} stroke={i === 0 ? "#ff3040" : "#fff"} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"><path d={d} /></svg>{n}
      </div>
    ))}
  </div>
);
const Reel: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 70% at 50% 40%, #6b5444, #3a2d26 55%, #1f1814)", color: "#fff" }}>
    <div style={{ position: "absolute", left: 0, right: 0, top: 230, textAlign: "center", fontSize: 150, transform: `rotate(${Math.sin(f / 9) * 4}deg) translateY(${Math.sin(f / 6) * 4}px)` }}>🍝</div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 440, textAlign: "center", font: "800 34px/1.1 -apple-system, system-ui", textShadow: "0 2px 0 #000, 0 0 14px rgb(0 0 0 / .5)" }}>
      {f < 232 ? "15 MIN PASTA 🍝" : "4 cloves garlic 🧄"}
    </div>
    <div style={{ position: "absolute", top: 70, left: 22, right: 22, display: "flex", justifyContent: "space-between", fontSize: 26, fontWeight: 700 }}><span>Reels</span><span>⌁</span></div>
    <Rail />
    <div style={{ position: "absolute", left: 18, right: 80, bottom: 40, fontSize: 17, lineHeight: 1.35 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: 36, height: 36, borderRadius: "50%", background: C.peach, boxShadow: "0 0 0 2px #2a211d, 0 0 0 4px #e1306c" }} />
        <b>pastaqueen</b><span style={{ border: "1px solid rgb(255 255 255 / .7)", borderRadius: 8, padding: "2px 10px", fontSize: 15 }}>Follow</span>
      </div>
      15 min garlic butter pasta 🧄 full recipe in the comments…
    </div>
  </div>
);
const IosSheet: React.FC<{ f: number }> = ({ f }) => {
  const up = prog(f, 247, 260) * (1 - prog(f, 288, 298));
  const picked = f >= 283 && f < 292;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#f2f2f7", color: "#111", borderRadius: "28px 28px 0 0", padding: "20px 16px 40px", transform: `translateY(${(1 - up) * 105}%)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: "1px solid #ddd", marginBottom: 16 }}>
        <span style={{ width: 50, height: 50, borderRadius: 10, background: "linear-gradient(135deg,#6b5444,#2a211d)" }} />
        <div style={{ flex: 1 }}><b style={{ display: "block", fontSize: 17 }}>instagram.com</b><span style={{ fontSize: 14, color: "#8e8e93" }}>Reel by pastaqueen</span></div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
        {[["AirDrop", "#d6ebff"], ["Messages", "#cdf3e1"], ["Mail", "#d6ebff"], ["Notes", "#fff0c4"]].map(([n, c]) => (
          <div key={n} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 13, width: 76 }}><span style={{ width: 64, height: 64, borderRadius: 15, background: c }} />{n}</div>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: 14, position: "relative" }}>
        {["Copy", "Skwirl", "Add to Reading List"].map((n) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", fontSize: 19, borderBottom: n === "Add to Reading List" ? 0 : "1px solid #e5e5ea", background: n === "Skwirl" && picked ? "#e5e5ea" : "transparent", position: "relative", fontWeight: n === "Skwirl" ? 600 : 400 }}>
            {n}
            {n === "Skwirl" ? <span style={{ width: 32, height: 32, borderRadius: 8, background: C.lavender, display: "grid", placeItems: "center" }}><Mark id="sheet" size={26} /></span> : <span style={{ color: "#8e8e93" }}>⧉</span>}
            {n === "Skwirl" ? <Tap at={285} x={70} y={30} dark /> : null}
          </div>
        ))}
      </div>
    </div>
  );
};
const Alert: React.FC<{ f: number }> = ({ f }) => {
  const s = prog(f, 292, 300, Easing.out(Easing.back(1.4))) * (1 - prog(f, 340, 350));
  return (
    <div style={{ position: "absolute", inset: 0, background: `rgb(0 0 0 / ${0.35 * s})`, display: "grid", placeItems: "center", opacity: s > 0 ? 1 : 0 }}>
      <div style={{ width: 300, background: "rgb(245 245 247 / .97)", borderRadius: 20, textAlign: "center", color: "#111", overflow: "hidden", transform: `scale(${0.85 + s * 0.15})`, opacity: s }}>
        <b style={{ display: "block", fontSize: 20, padding: "22px 18px 4px" }}>Saved to Skwirl</b>
        <p style={{ fontSize: 16, margin: "0 18px 18px", lineHeight: 1.35 }}>Your note will be ready in a few minutes.</p>
        <span style={{ display: "block", borderTop: "1px solid #d1d1d6", padding: 14, color: "#0a84ff", fontWeight: 600, fontSize: 19 }}>OK</span>
      </div>
    </div>
  );
};
const Shot: React.FC<{ src: string; scroll?: number; ratio: number }> = ({ src, scroll = 0, ratio }) => (
  <Img src={f_(src)} style={{ position: "absolute", left: 0, top: 0, width: "100%", transform: `translateY(${-scroll * ratio}px)` }} />
);
const PhoneStage: React.FC = () => {
  const f = useCurrentFrame() + S.share;
  const { fps } = useVideoConfig();
  const enter = spring({ frame: f - S.share, fps, config: { damping: 18, stiffness: 120 } });
  const leave = prog(f, 680, 692, Easing.in(Easing.cubic));
  const noteIn = prog(f, 350, 362), listsIn = prog(f, 552, 562);
  const scrollNote = prog(f, 420, 470, Easing.inOut(Easing.cubic)) * 0.44; // down to the ingredients
  const H = 400 * (2196 / 540); // note screenshot height at the screen's width
  const tilt = interpolate(f, [S.share, 680], [-7, 4]);
  return (
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingRight: 230 }}>
      <div style={{ transform: `translateY(${(1 - enter) * 900 + leave * 200}px) rotateY(${tilt}deg) rotateZ(${(1 - enter) * 8}deg)`, opacity: 1 - leave, perspective: 1200 }}>
        <Phone>
          {f < 362 ? <><Reel f={f} /><Tap at={240} x={352} y={600} /><IosSheet f={f} /><Alert f={f} /></> : null}
          <div style={{ position: "absolute", inset: 0, paddingTop: 0, opacity: noteIn * (1 - listsIn), background: C.bg }}><Shot src="note.webp" scroll={scrollNote} ratio={H} /></div>
          <div style={{ position: "absolute", inset: 0, opacity: listsIn, background: C.bg }}><Shot src="lists.webp" ratio={0} /></div>
        </Phone>
      </div>
    </AbsoluteFill>
  );
};
const Left: React.FC<{ children: React.ReactNode; inAt: number; outAt: number }> = ({ children, inAt, outAt }) => {
  const s = useInOut(inAt - S.share, outAt - S.share, 30);
  return <div style={{ position: "absolute", left: 170, top: 0, bottom: 0, width: 900, display: "flex", flexDirection: "column", justifyContent: "center", gap: 40, ...s }}>{children}</div>;
};
const Stagger: React.FC<{ items: React.ReactNode[]; from: number; every: number }> = ({ items, from, every }) => {
  const f = useCurrentFrame(); // sequence-local, like `from`
  const { fps } = useVideoConfig();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
      {items.map((it, i) => {
        const s = spring({ frame: f - from - i * every, fps, config: { damping: 14, stiffness: 170 } });
        return <div key={i} style={{ opacity: Math.min(1, s * 1.3), transform: `translateY(${(1 - s) * 30}px) scale(${0.9 + s * 0.1})` }}>{it}</div>;
      })}
    </div>
  );
};
const MENTIONS: [string, string, string, string][] = [["📖", "Deep Work", "Book", C.lavender], ["📍", "Senso-ji, Asakusa", "Place", C.mint], ["🎬", "Perfect Days", "Movie", C.peach]];
const Story: React.FC = () => (
  <AbsoluteFill>
    <PhoneStage />
    <Left inAt={S.share} outAt={352}>
      <Kinetic captions={cap(share)} voAt={VO.share - S.share} style={{ fontSize: 120 }} breakAfter={[1]} />
      <Stagger from={262 - S.share} every={4} items={["Instagram", "TikTok", "YouTube", "X", "Threads"].map((n) => <Pill key={n}>{n}</Pill>)} />
    </Left>
    <Left inAt={362} outAt={534}>
      <Kinetic captions={cap(noteVo)} voAt={VO.note - S.share} style={{ fontSize: 86 }} breakAfter={[4]} />
      <Stagger from={392 - S.share} every={8} items={[["🔊", "Audio"], ["🔤", "On-screen text"], ["✍️", "Caption"], ["💬", "Top comments"]].map(([e, n]) => <Pill key={n} bg={C.butter}>{e} {n}</Pill>)} />
    </Left>
    <Left inAt={542} outAt={678}>
      <Kinetic captions={cap(lists)} voAt={VO.lists - S.share} style={{ fontSize: 86 }} breakAfter={[2]} />
      <Stagger from={590 - S.share} every={7} items={MENTIONS.map(([e, n, k, c]) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", borderRadius: 26, padding: "14px 24px 14px 14px", boxShadow: lift, fontFamily: ui }}>
          <span style={{ width: 56, height: 56, borderRadius: "50%", background: c, display: "grid", placeItems: "center", fontSize: 28 }}>{e}</span>
          <div><b style={{ display: "block", fontSize: 26, fontWeight: 600 }}>{n}</b><span style={{ color: C.muted, fontSize: 20 }}>{k}</span></div>
        </div>
      ))} />
    </Left>
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
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      <div style={{ position: "absolute", top: 96, left: 0, right: 0, textAlign: "center" }}>
        <Kinetic captions={cap(claude)} voAt={VO.claude - S.claude} style={{ fontSize: 96 }} />
      </div>
      <div style={{ position: "absolute", left: "50%", top: 300, width: 1180, marginLeft: -590, background: "#fff", borderRadius: 36, boxShadow: lift, padding: "34px 44px 40px", fontFamily: ui, opacity: win, transform: `translateY(${(1 - win) * 80}px)` }}>
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
        <div style={{ fontSize: 30, lineHeight: 1.45, color: C.ink, minHeight: 130 }}>{answer}</div>
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
  return (
    <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 26, opacity: lock, transform: `scale(${0.85 + lock * 0.15})` }}>
        <Mark id="outro" size={150} />
        <span style={{ fontFamily: display, fontSize: 150, letterSpacing: "-0.035em", color: C.ink, lineHeight: 1 }}>Skwirl</span>
      </div>
      <Kinetic captions={cap(outro)} voAt={VO.outro - S.outro} skip={1} style={{ fontSize: 76, textAlign: "center" }} />
      <div style={{ display: "flex", gap: 16, opacity: url, transform: `translateY(${(1 - url) * 24}px)` }}>
        <Pill bg={C.ink} color="#fff" style={{ height: 70, fontSize: 30, padding: "0 32px" }}>skwirl.parthakholkar.com</Pill>
        <Pill bg={C.mint} color="#17603f" style={{ height: 70, fontSize: 30, padding: "0 32px" }}>Free while in beta</Pill>
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
    <Sfx at={240} src="sfx-click_001.ogg" /><Sfx at={285} src="sfx-click_001.ogg" /><Sfx at={293} src="sfx-select_008.ogg" vol={0.3} />
    <Sfx at={735} src="sfx-switch2.ogg" vol={0.25} /><Sfx at={748} src="sfx-select_008.ogg" vol={0.25} />
    <Sfx at={812} src="sfx-bong_001.ogg" vol={0.25} />
  </AbsoluteFill>
);
