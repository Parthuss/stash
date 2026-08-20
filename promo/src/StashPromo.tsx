import React from "react";
import { Audio, Series, interpolate, staticFile } from "remotion";
import { CaptureScene } from "./components/CaptureScene";
import { ConfirmationScene } from "./components/ConfirmationScene";
import { Captions } from "./components/Captions";
import { RecallScene } from "./components/RecallScene";
import { OutroCard } from "./components/OutroCard";
import { SceneFade } from "./components/SceneFade";
import { WordCaptions } from "./components/WordCaptions";
import captureCaptions from "./captions-data/vo-1-capture.json";
import confirmationCaptions from "./captions-data/vo-2-confirmation.json";
import recallCaptions from "./captions-data/vo-4-recall.json";

// Fade-in only, over the first 6 frames — avoids a click at the hard scene
// cut. Each clip is short narration that trails off naturally at its own
// end rather than getting cut mid-word, so no fade-out is needed.
const fadeIn = (f: number) =>
  interpolate(f, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

// 30fps. Scenes 1-2 are real screen recording (censored); the recall scene
// is a mockup because it's a future moment that can't be recorded yet.
// Each scene carries its own Kokoro-generated voiceover clip (promo/tts/),
// started at the scene's own frame 0 so narration stays anchored to the
// visual beat regardless of how long the audio itself runs. Word-level
// captions (promo/captions/, whisper.cpp) are added only where there's no
// competing on-screen text already saying the same thing — the time-skip
// and outro scenes already carry a matching headline/tagline.
export const StashPromo: React.FC = () => {
  return (
    <Series>
      <Series.Sequence durationInFrames={300}>
        <SceneFade durationInFrames={300} fadeIn={12} fadeOut={12}>
          <CaptureScene />
        </SceneFade>
        <Audio src={staticFile("vo-1-capture.wav")} volume={fadeIn} />
        <WordCaptions captions={captureCaptions} />
      </Series.Sequence>

      <Series.Sequence durationInFrames={165}>
        <SceneFade durationInFrames={165} fadeIn={12} fadeOut={12}>
          <ConfirmationScene />
        </SceneFade>
        <Audio src={staticFile("vo-2-confirmation.wav")} volume={fadeIn} />
        <WordCaptions captions={confirmationCaptions} />
      </Series.Sequence>

      <Series.Sequence durationInFrames={55}>
        <SceneFade durationInFrames={55}>
          <Captions
            label="TIME SKIP"
            parts={["Later", "—", "working", "in", "Claude|#2F6FED", "Code|#2F6FED"]}
          />
        </SceneFade>
        <Audio src={staticFile("vo-3-timeskip.wav")} volume={fadeIn} />
      </Series.Sequence>

      <Series.Sequence durationInFrames={400}>
        <SceneFade durationInFrames={400} fadeIn={12} fadeOut={16}>
          <RecallScene />
        </SceneFade>
        <Audio src={staticFile("vo-4-recall.wav")} volume={fadeIn} />
        <WordCaptions captions={recallCaptions} />
      </Series.Sequence>

      <Series.Sequence durationInFrames={190}>
        <SceneFade durationInFrames={190} fadeIn={16} fadeOut={0}>
          <OutroCard />
        </SceneFade>
        <Audio src={staticFile("vo-5-outro.wav")} volume={fadeIn} />
      </Series.Sequence>
    </Series>
  );
};
