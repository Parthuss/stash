// Piece 11: "girl, zoom in" carousel (1080×1350). Script: promo/scripts/11-zoom-in.md
// Render: npx remotion still src/insta/index.ts Z11-2 out/instagram/11-zoom-in/02.png
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, D, Ground, lift, Mark, ui } from "../launch/kit";

const TINTS = [C.butter, C.lavender, C.sky, C.peach, C.mint];

// [emoji, joke]. Order is the reading order nobody follows; positions are scattered below.
const JOKES: [string, string][] = [
  ["🍲", "15 min dal (took 2 hours)"], ["🍞", "easy sourdough (day 9)"],
  ["🍪", "protein cookies (ate the dough)"], ["🧀", "viral feta pasta (2021, still here)"], ["☕", "chai, the hotel way"],
  ["🥗", "meal prep sunday (it was tuesday)"], ["🍮", "3 ingredient dessert (had 2)"], ["🧘", "10 min stretch (did it once, 2023)"],
  ["💪", "75 hard (day 2)"], ["🪑", "fix your posture (saved lying down)"], ["⏰", "5am routine (saved at 2am)"],
  ["📓", "journaling prompts (journal still empty)"], ["🧴", "skincare in the right order (wrong order)"], ["📚", "5 books that changed my life (not yet)"],
  ["📊", "learn excel in 10 min (vlookup who)"], ["🎤", "speak so people listen (nobody did)"], ["🌧️", "rainy day movie (sunny for 3 months)"],
  ["🏖️", "goa itinerary (2022)"], ["🥐", "cafés in bangalore (i live in ahmedabad)"], ["🏝️", "hidden beach nobody knows (4M views)"],
  ["🗾", "japan on a budget (no)"], ["🚗", "weekend trip ideas (weekend over)"], ["💼", "how to ask for a raise (didn't ask)"],
  ["💸", "50/30/20 budget (100/0/0)"], ["💬", "linkedin tips (posted 0 times)"], ["🚀", "side hustle ideas (still deciding)"],
  ["🛋️", "room makeover under 2k (unchanged)"], ["🪴", "plants you can't kill (killed it)"], ["🛏️", "fold a fitted sheet (rolled it up)"],
  ["💐", "gift ideas for mom (flowers again)"], ["⏳", "watch later (it's later)"], ["👯", "send this to your bestie (she saved it too)"],
  ["🛑", "don't scroll past this (scrolled past)"], ["2️⃣", "part 2? (never found part 1)"], ["🔎", "the one you're looking for (it isn't)"],
  ["🍟", "airfryer recipes (no airfryer)"], ["🎸", "learn guitar in 30 days (day 1)"], ["🌅", "how to wake up early (snoozed)"],
  ["👗", "wedding guest outfits (no invites)"], ["💄", "makeup dupes (bought the real one)"], ["💧", "drink more water (this is coffee)"],
  ["📖", "read 50 books a year (read this caption)"], ["🏓", "pickleball rules (never played)"], ["🧩", "this tile is why you need search"],
];
const PLAIN: [string, string][] = [
  ["🍜", "recipe"], ["🏋️", "workout"], ["✈️", "trip"], ["👟", "outfit"], ["😂", "meme"], ["🎧", "song"], ["☕", "café"],
  ["💡", "tips"], ["🎬", "movie"], ["📍", "place"], ["🧁", "baking"], ["🎨", "diy"], ["🐶", "dog"], ["📸", "pose ideas"],
];
const COLS = 8, ROWS = 11, EGG = 8 * 7 + 6; // row 8, col 7 (0-based): lower right third, not the first rows
const PASTA = 8 * 6 + 2; // row 7, col 3: the one they are hunting for, well away from the corners
const PASTA_TILE = { e: "🍝", t: "garlic butter pasta in 15 min", joke: true };
// Deterministic scatter: tile i gets a joke if this hash says so, until all jokes are placed.
const tiles = (() => {
  const out: { e: string; t: string; joke: boolean; egg?: boolean }[] = [];
  let j = 0, p = 0;
  for (let i = 0; i < COLS * ROWS; i++) {
    if (i === PASTA) { out.push(PASTA_TILE); continue; }
    if (i === EGG) { out.push({ e: "🐿️", t: "found it. comment 🐿️ so we know you zoomed", joke: true, egg: true }); continue; }
    const left = COLS * ROWS - i, need = JOKES.length - j;
    const take = need > 0 && (need >= left - (i < EGG ? 1 : 0) - (i < PASTA ? 1 : 0) || ((i * 7919 + 31) % 101) < 50);
    if (take) { const [e, t] = JOKES[j++]; out.push({ e, t, joke: true }); }
    else { const [e, t] = PLAIN[p++ % PLAIN.length]; out.push({ e, t, joke: false }); }
  }
  return out;
})();

const Card: React.FC<{ n: number; children: React.ReactNode }> = ({ n, children }) => (
  <AbsoluteFill>
    <Ground />
    <div style={{ position: "absolute", left: 70, top: 70, width: 940, height: 1210, borderRadius: 56, background: "rgb(255 255 255 / .72)", boxShadow: lift, overflow: "hidden", display: "flex", flexDirection: "column", padding: "84px 72px 0" }}>
      {children}
      <div style={{ height: 120, display: "flex", alignItems: "center", gap: 14, fontFamily: ui, fontWeight: 600, fontSize: 36, color: C.ink }}>
        <Mark size={56} id={`z${n}`} />Skwirl
        <span style={{ marginLeft: "auto", fontWeight: 400, fontSize: 30, color: C.muted }}>{n}/6</span>
      </div>
    </div>
  </AbsoluteFill>
);

// The 🤏 shape from Microsoft's Fluent Emoji ("Pinching hand", flat, MIT licence,
// github.com/microsoft/fluentui-emoji), recoloured to the brand with an ink sticker outline.
// `children` is the pinched thing, in the emoji's 32-unit space, centred at 0,0.
const HAND = "M24.1094 14.6094C25.4544 13.6156 27.2039 13.8119 28.2969 15.2032C30.2488 17.6878 27.7538 19.8163 25.85 21.4404C25.3881 21.8344 24.961 22.1987 24.6406 22.5313C23.7696 23.3412 23.065 24.0427 22.4216 24.6835C21.7492 25.353 21.1435 25.9561 20.4844 26.5469C18.0695 28.7115 15.6163 29.9375 12.4062 29.9375C6.03125 29.9375 2.25 25.5625 2.25 18.9463L2.17601 14.905C2.13238 14.7181 2.10938 14.5239 2.10938 14.3246V10.6754C2.10938 9.20002 3.37087 8.00002 4.92188 8.00002C5.80326 8.00002 6.59114 8.38752 7.10717 8.99286C7.43583 7.86017 8.48265 7.03001 9.72 7.03001C10.7524 7.03001 11.6522 7.60322 12.1128 8.44965C12.5979 7.58547 13.5234 7.00002 14.5826 7.00002C15.819 7.00002 16.8732 7.79149 17.2574 8.90149C19.3064 5.35714 22.5406 3.94797 26.5 5.60939C28.0781 6.35937 28.0325 7.99747 27.8281 8.75003C27.5362 9.82524 26.4099 11.2899 24.6797 10.8516C23.574 10.5715 22.4453 10.5313 22.4453 11.8516L22.4141 14.4922C22.4141 16.1625 22.9681 15.6439 23.5931 15.059C23.7632 14.8998 23.9385 14.7356 24.1094 14.6094Z";
const HAND_SHADE = ["M17.2703 8.87919C17.4062 9.2762 17.5156 9.82554 17.5156 10.6875V11.8984C17.8854 10.1302 19.325 6.29375 22.125 5.09375H21.8363C19.988 5.55049 18.4378 6.86957 17.2703 8.87919Z", "M2.15759 14.8197C2.40234 16.0593 3.54861 17 4.92183 17C5.57674 17 6.18003 16.7861 6.65852 16.4278C6.30651 15.8532 6 14.9845 6 14.1094V9.81251C6 9.1658 6.14236 8.66073 6.29565 8.34131C6.60982 8.50926 6.88683 8.73296 7.11176 8.9982L7.10798 9.01071C7.05 9.2048 7 9.47432 7 9.81251V14.1094C7 14.6573 7.16345 15.219 7.36864 15.6431L7.36766 15.6448C7.78614 16.3634 8.52439 16.8737 9.38613 16.9796C9.66667 16.9659 9.96189 16.9537 10.268 16.9445C10.6983 16.8562 11.0919 16.6659 11.4223 16.4001C11.1157 15.836 10.9062 15.0935 10.9062 14.3047C10.9062 13.7455 10.9207 12.6947 10.935 11.6917L10.9388 11.426C10.9517 10.5192 10.9636 9.69274 10.9636 9.34376C10.9636 8.59573 11.133 8.02478 11.4255 7.62848C11.7036 7.85162 11.9368 8.12823 12.1092 8.44283C12.0274 8.6406 11.9636 8.92948 11.9636 9.34376C11.9636 9.70046 11.9516 10.5339 11.9387 11.4354L11.9349 11.706C11.9205 12.7124 11.9062 13.7545 11.9062 14.3047C11.9062 14.7572 11.9949 15.1844 12.1288 15.5426L12.1299 15.5405C12.6195 16.3881 13.5357 16.96 14.5825 16.96C15.9185 16.96 17.0418 16.0286 17.3368 14.7812H17.375C17.375 15.8103 17.3038 16.8282 16.95 17.6097C17.3487 17.7426 17.7224 17.8999 18.0608 18.0857C18.2455 18.187 18.3468 18.3933 18.3141 18.6014C18.2815 18.8095 18.1221 18.9747 17.9154 19.0148L17.9136 19.0151L17.9044 19.017L17.8632 19.0257C17.8258 19.0338 17.769 19.0465 17.6947 19.0644C17.5461 19.1002 17.3275 19.1567 17.0542 19.2384C16.507 19.4018 15.7429 19.6653 14.8817 20.0637C13.1548 20.8625 11.0651 22.1907 9.53878 24.3156C9.37768 24.5399 9.06527 24.5911 8.84099 24.43C8.61671 24.2689 8.5655 23.9565 8.7266 23.7322C10.3877 21.4197 12.6418 19.9979 14.4618 19.1561C14.5599 19.1107 14.6567 19.067 14.7523 19.0249C14.6756 19.0291 14.5967 19.0312 14.5156 19.0312C13.0778 19.0312 12.3582 18.3827 12.1004 17.9333C12.0461 17.9321 11.9918 17.9312 11.9377 17.9303C11.6241 18.5055 10.7169 19.0312 9.79683 19.0312C8.64683 19.0312 7.7187 18.3125 7.4687 17.75C7.07808 18.3125 6.37495 19.0312 5.12495 19.0312C2.77902 19.0312 2.2015 15.8806 2.15759 14.8197Z"];
const PinchHand: React.FC<{ size: number; children: React.ReactNode }> = ({ size, children }) => (
  <svg viewBox="0 0 32 32" width={size} height={size} style={{ overflow: "visible" }}>
    <path d={HAND} fill={C.ink} stroke={C.ink} strokeWidth={1.3} strokeLinejoin="round" />
    <g transform="translate(25.7 12.8) rotate(-10)">{children}</g>
    <path d={HAND} fill="#ffd2bf" />
    {HAND_SHADE.map((d, i) => <path key={i} d={d} fill="#f2a487" />)}
  </svg>
);

const TinyPhone: React.FC = () => (
  <g transform="translate(-1.15 -2.2)">
    <rect width={2.3} height={4.4} rx={0.45} fill="#15131f" />
    <rect x={0.18} y={0.18} width={1.94} height={4.04} rx={0.33} fill={C.bg} />
    {Array.from({ length: 12 }, (_, i) => <rect key={i} x={0.3 + (i % 3) * 0.58} y={0.75 + Math.floor(i / 3) * 0.78} width={0.5} height={0.68} rx={0.08} fill={TINTS[i % 5]} />)}
  </g>
);

type T = { e: string; t: string; joke: boolean };
const TW = (1080 - 2 * 32 - (COLS - 1) * 8) / COLS, TH = (1350 - 132 - 28 - (ROWS - 1) * 8) / ROWS;
const Tile: React.FC<{ t: T; i: number }> = ({ t, i }) => (
  <div style={{ width: TW, height: TH, borderRadius: 10, overflow: "hidden", background: "#fff", boxShadow: "0 0 0 1px #ebe8f7", display: "flex", flexDirection: "column" }}>
    <div style={{ height: 34, flex: "none", background: `linear-gradient(160deg, ${TINTS[(i * 3) % 5]}, #fff)`, display: "grid", placeItems: "center", fontSize: 22 }}>{t.e}</div>
    <div style={{ padding: "4px 6px 0", fontFamily: ui, fontWeight: t.joke ? 600 : 500, fontSize: 13.5, lineHeight: "16px", color: t.joke ? C.ink : C.muted, letterSpacing: -0.1 }}>{t.t}</div>
  </div>
);

// 1. The trend's opener, plus the mission so slide 2 has a point.
export const Z11_1: React.FC = () => (
  <AbsoluteFill>
    <Ground />
    <div style={{ position: "absolute", top: 210, width: "100%", textAlign: "center" }}>
      <div style={{ ...D, fontSize: 150, lineHeight: 1, letterSpacing: -3, color: C.ink }}>girl,<br />zoom in</div>
      <div style={{ fontFamily: ui, fontWeight: 500, fontSize: 40, lineHeight: 1.35, color: C.ink, marginTop: 36 }}>
        There's a pasta recipe hiding in my<br />Saved folder. Bet you can't find it.
      </div>
      <div style={{ fontFamily: ui, fontWeight: 600, fontSize: 32, color: C.muted, marginTop: 18 }}>swipe, then pinch →</div>
    </div>
    <div style={{ position: "absolute", left: 230, top: 740 }}><PinchHand size={600}><TinyPhone /></PinchHand></div>
  </AbsoluteFill>
);

// 2. The hunt. The mission stays on screen so nobody has to remember it.
export const Z11_2: React.FC = () => (
  <AbsoluteFill style={{ background: "#fff" }}>
    <div style={{ height: 132, display: "flex", alignItems: "center", padding: "0 40px", gap: 22, fontFamily: ui, color: C.ink }}>
      <span style={{ fontSize: 44, fontWeight: 500 }}>‹</span>
      <span style={{ fontSize: 38, fontWeight: 600 }}>Saved</span>
      <span style={{ marginLeft: "auto", fontSize: 28, fontWeight: 600, background: C.peach, color: C.peachInk, borderRadius: 999, padding: "12px 24px" }}>🔍 find: garlic butter pasta</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLS}, ${TW}px)`, gridAutoRows: TH, gap: 8, padding: "0 32px" }}>
      {tiles.map((t, i) => <Tile key={i} t={t} i={i} />)}
    </div>
  </AbsoluteFill>
);

// 3. The answer, so nobody has to swipe back: where it was, and the real problem.
export const Z11_3: React.FC = () => {
  const col = PASTA % COLS, row = Math.floor(PASTA / COLS), z = 3.3, tileY = 420;
  const cx = 32 + col * (TW + 8) + TW / 2, cy = 132 + row * (TH + 8) + TH / 2;
  return (
    <AbsoluteFill style={{ background: C.ink }}>
      <div style={{ position: "absolute", inset: 0, opacity: 0.12, filter: "blur(1.5px)" }}><Z11_2 /></div>
      {/* coral ring on the real spot in the grid, a dashed line up to the blown-up tile */}
      <svg width={1080} height={1350} style={{ position: "absolute", inset: 0 }}>
        <path d={`M ${cx + TW / 2 + 14} ${cy - 10} C ${cx + 220} ${cy - 40}, 560 ${tileY + 340}, 600 ${tileY + 300}`} fill="none" stroke={C.coral} strokeWidth={6} strokeDasharray="4 14" strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", left: cx - TW / 2 - 12, top: cy - TH / 2 - 12, width: TW + 24, height: TH + 24, borderRadius: 18, border: `6px solid ${C.coral}` }} />
      <div style={{ position: "absolute", left: 90, right: 90, top: 150, ...D, fontSize: 104, lineHeight: 1.04, letterSpacing: -2, color: "#fff" }}>Found it?<br />It was right here.</div>
      <div style={{ position: "absolute", left: 600, top: tileY, transform: `scale(${z}) rotate(3deg)`, transformOrigin: "top left", filter: "drop-shadow(0 6px 12px rgb(0 0 0 / .35))" }}>
        <Tile t={PASTA_TILE} i={PASTA} />
      </div>
      <div style={{ position: "absolute", left: 90, right: 90, top: 1040, fontFamily: ui, fontSize: 40, lineHeight: 1.35, color: "rgb(255 255 255 / .88)" }}>
        That was 88 saves. Mine has 1,215.<br />And Instagram's Saved folder has no search bar.
      </div>
    </AbsoluteFill>
  );
};

const Shot: React.FC<{ src: string; w: number; h: number; style?: React.CSSProperties }> = ({ src, w, h, style }) => (
  <div style={{ width: w, height: h, borderRadius: 36, overflow: "hidden", boxShadow: lift, background: "#fff", position: "absolute", ...style }}>
    <Img src={staticFile(`insta/${src}`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
  </div>
);
const Arrow: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <svg viewBox="0 0 120 60" width={120} height={60} style={{ position: "absolute", ...style }}>
    <path d="M6 34 C 40 6, 80 6, 108 30" fill="none" stroke={C.ink} strokeWidth={7} strokeLinecap="round" />
    <path d="M90 16 L 110 31 L 88 42" fill="none" stroke={C.ink} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// 4. Now introduce Skwirl: what it does with a reel.
export const Z11_4: React.FC = () => (
  <Card n={4}>
    <div style={{ ...D, fontSize: 92, lineHeight: 1.04, letterSpacing: -1, color: C.ink }}>So I made Skwirl.</div>
    <div style={{ fontFamily: ui, fontSize: 36, lineHeight: 1.35, color: "rgb(29 27 46 / .8)", marginTop: 22 }}>
      Share a reel to it. It watches the reel for you (the audio, the text on screen, the caption) and turns it into a note.
    </div>
    <div style={{ flex: 1, position: "relative" }}>
      <div style={{ position: "absolute", left: 30, top: 230, transform: "scale(2.3) rotate(-4deg)", transformOrigin: "top left" }}><Tile t={PASTA_TILE} i={PASTA} /></div>
      <Arrow style={{ left: 300, top: 310 }} />
      <Shot src="note.png" w={400} h={640} style={{ right: -16, top: 60, transform: "rotate(3deg)" }} />
    </div>
  </Card>
);

// 5. The payoff: search by what you remember.
export const Z11_5: React.FC = () => (
  <Card n={5}>
    <div style={{ ...D, fontSize: 92, lineHeight: 1.04, letterSpacing: -1, color: C.ink }}>Next time, just type what you remember.</div>
    <div style={{ flex: 1, position: "relative" }}>
      <Shot src="search-pasta.png" w={540} h={560} style={{ left: 128, top: 40, transform: "rotate(-2deg)" }} />
      <div style={{ position: "absolute", left: 470, top: 380, fontFamily: ui, fontWeight: 600, fontSize: 34, color: C.peachInk, background: C.peach, borderRadius: 999, padding: "14px 26px", transform: "rotate(-5deg)", boxShadow: lift }}>← there it is</div>
    </div>
    <div style={{ fontFamily: ui, fontSize: 34, lineHeight: 1.35, color: "rgb(29 27 46 / .8)", textAlign: "center" }}>It searches by meaning. No scrolling, no rewatching.</div>
  </Card>
);

// 6. CTA, and a reason to swipe back to slide 2.
export const Z11_6: React.FC = () => (
  <Card n={6}>
    <div style={{ ...D, fontSize: 130, lineHeight: 1, letterSpacing: -2, color: C.ink }}>Skwirl.</div>
    <div style={{ ...D, fontSize: 76, lineHeight: 1.06, letterSpacing: -1, color: C.ink, marginTop: 24 }}>Your saved reels, finally findable.</div>
    <div style={{ fontFamily: ui, fontSize: 40, color: "rgb(29 27 46 / .78)", marginTop: 30 }}>Free. Link in bio.</div>
    <div style={{ flex: 1, display: "grid", placeItems: "center" }}><Mark size={230} id="z6big" /></div>
    <div style={{ fontFamily: ui, fontWeight: 600, fontSize: 32, color: C.peachInk, background: C.peach, borderRadius: 24, padding: "18px 30px", alignSelf: "center", textAlign: "center", marginBottom: 10, lineHeight: 1.3 }}>P.S. one more tile on slide 2 is hiding<br />something. Go back and look 👀</div>
  </Card>
);

export const ZOOM_SLIDES = [Z11_1, Z11_2, Z11_3, Z11_4, Z11_5, Z11_6];
