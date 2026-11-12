/**
 * Silent ~15 s demo of every shot recipe on real Skwirl screenshots. Every cut lands on the 15-frame beat grid.
 *  0  PushIn | 60 FocusRing (flash cut) | 120 TypeIn (whip) | 210 CrashZoom (hidden cut) | 300 BeatPunch (flash) | 375 Parallax
 */
import React from "react";
import { AbsoluteFill, Img, Sequence, staticFile, useCurrentFrame } from "remotion";
import { C, D, Ground, Phone, prog, ui } from "../launch/kit";
import { BeatPunch, CrashZoom, FlashCut, FocusRing, HiddenCut, Parallax, PushIn, ScreenImg, TypeIn, WhipPan, beats } from "./shots";

const NOTE = "recipes/note.png", FULL = "recipes/note-full.png", SEARCH = "recipes/search-pasta.png";
const B = (n: number) => beats(n);

const Label: React.FC<{ name: string; sub: string; at: number }> = ({ name, sub, at }) => {
  const f = useCurrentFrame();
  const t = prog(f, at, at + 10);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 52, display: "flex", justifyContent: "center", zIndex: 50, opacity: t, transform: `translateY(${(1 - t) * 14}px)` }}>
      <div style={{ background: C.ink, borderRadius: 40, padding: "16px 40px 18px", textAlign: "center", boxShadow: "0 12px 30px rgb(60 50 120 / .3)" }}>
        <div style={{ ...D, color: C.butter, fontSize: 54, lineHeight: 1.05 }}>{name}</div>
        <div style={{ fontFamily: ui, fontWeight: 500, fontSize: 24, color: C.lavender, marginTop: 4 }}>{sub}</div>
      </div>
    </div>
  );
};

type SceneProps = { lead: number };
const S0: React.FC<SceneProps> = ({ lead }) => (
  <AbsoluteFill>
    <PushIn start={lead} duration={50} rect={{ x: 36, y: 388, w: 290, h: 74 }} endScale={1.6}><ScreenImg src={NOTE} /></PushIn>
    <Label name="PushIn" sub="slow push to one field" at={lead + 2} />
  </AbsoluteFill>
);
const S1: React.FC<SceneProps> = ({ lead }) => (
  <AbsoluteFill>
    <FocusRing start={lead} rect={{ x: 18, y: 512, w: 355, h: 49 }} label="Tick it when you make it"><ScreenImg src={NOTE} /></FocusRing>
    <Label name="FocusRing" sub="dim all but the field" at={lead + 2} />
  </AbsoluteFill>
);
const S2: React.FC<SceneProps> = ({ lead }) => (
  <AbsoluteFill>
    <TypeIn start={lead + 4} text="that pasta thing" coverSrc={SEARCH}><ScreenImg src={SEARCH} /></TypeIn>
    <Label name="TypeIn" sub="type, results, tap" at={lead + 2} />
  </AbsoluteFill>
);
const S3: React.FC<SceneProps> = ({ lead }) => (
  <AbsoluteFill>
    <CrashZoom start={lead + 14} mode="bounce" frac={0.85} rect={{ x: 36, y: 388, w: 290, h: 74 }}><ScreenImg src={NOTE} /></CrashZoom>
    <Label name="CrashZoom" sub="one 6-frame punch" at={lead + 2} />
  </AbsoluteFill>
);
const S4: React.FC<SceneProps> = () => (
  <AbsoluteFill>
    <BeatPunch beats={[B(1), B(2)]} focus={[{ x: 103, y: 312 }, { x: 97, y: 362 }]}><ScreenImg src={SEARCH} /></BeatPunch>
    <Label name="BeatPunch" sub="1.0 > 1.6 > 2.6 on the beat" at={B(1)} />
  </AbsoluteFill>
);
const Card: React.FC<{ src: string; w: number; style?: React.CSSProperties }> = ({ src, w, style }) => (
  <div style={{ position: "absolute", left: (1080 - w) / 2, top: (1920 - w * 880 / 424) / 2, ...style }}>
    <div style={{ width: 424, height: 880, transform: `scale(${w / 424})`, transformOrigin: "0 0" }}>
      <Phone><div style={{ width: 400, height: 856, overflow: "hidden" }}><Img src={src} style={{ width: 400, display: "block" }} /></div></Phone>
    </div>
  </div>
);
const NOTEURL = staticFile(NOTE), FULLURL = staticFile(FULL), SEARCHURL = staticFile(SEARCH);
const S5: React.FC<SceneProps> = () => {
  return (
    <AbsoluteFill>
      <Parallax duration={45} layers={[
        { speed: 0.35, blur: 4, sat: 0.55, node: <Card src={FULLURL} w={620} style={{ left: -150, top: -260, opacity: 0.7, transform: "rotate(-8deg)" }} /> },
        { speed: 0.7, blur: 2, sat: 0.8, node: <Card src={SEARCHURL} w={560} style={{ left: 600, top: 520, transform: "rotate(7deg)" }} /> },
        { speed: 1.4, node: <Card src={NOTEURL} w={700} /> },
      ]} />
      <Label name="Parallax" sub="depth layers, hero lifts" at={B(1)} />
    </AbsoluteFill>
  );
};

type Scene = { C: React.FC<SceneProps>; start: number; len: number; lead: number };
// lead = frames a scene is on screen before its start (only when a whip or hidden cut brings it in).
const SC: Scene[] = [
  { C: S0, start: 0, len: B(4), lead: 0 },
  { C: S1, start: B(4), len: B(4), lead: 0 },
  { C: S2, start: B(8), len: B(6), lead: 8 },
  { C: S3, start: B(14), len: B(6), lead: 8 },
  { C: S4, start: B(20), len: B(5), lead: 0 },
  { C: S5, start: B(25), len: B(5), lead: 0 },
];
export const DEMO_FRAMES = B(30);
const WHIP = SC[2].start - 7, HIDDEN = SC[3].start - 7;

const Seq = (i: number) => {
  const s = SC[i];
  return (
    <Sequence from={s.start - s.lead} durationInFrames={s.len + s.lead + 16} name={`scene-${i}`}>
      <s.C lead={s.lead} />
    </Sequence>
  );
};

export const RecipeDemo: React.FC = () => {
  const f = useCurrentFrame();
  let body: React.ReactNode;
  if (f < SC[1].start) body = Seq(0);
  else if (f < WHIP) body = Seq(1);
  else if (f < WHIP + 14) body = <WhipPan start={WHIP} from={Seq(1)} to={Seq(2)} />;
  else if (f < HIDDEN) body = Seq(2);
  else if (f < HIDDEN + 14) body = <HiddenCut start={HIDDEN} from={Seq(2)} to={Seq(3)} />;
  else if (f < SC[4].start) body = Seq(3);
  else if (f < SC[5].start) body = Seq(4);
  else body = Seq(5);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Ground />
      {body}
      <FlashCut at={SC[1].start} />
      <FlashCut at={SC[4].start} />
    </AbsoluteFill>
  );
};
