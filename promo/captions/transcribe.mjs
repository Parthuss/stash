// Word-level transcription for each per-scene voiceover clip, following
// Remotion's own template-tiktok approach (whisper.cpp, local, free).
// Each clip is transcribed independently so its word timestamps stay
// relative to that clip's own start — matching how the clip is placed at
// its scene's frame 0 in StashPromo.tsx.
import {
  installWhisperCpp,
  downloadWhisperModel,
  transcribe,
  toCaptions,
} from "@remotion/install-whisper-cpp";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const WHISPER_PATH = path.join(process.cwd(), "whisper.cpp");
const WHISPER_VERSION = "1.6.0";
const WHISPER_MODEL = "medium.en";

const CLIPS = [
  "vo-1-capture",
  "vo-2-confirmation",
  "vo-3-timeskip",
  "vo-4-recall",
  "vo-5-outro",
];

const publicDir = path.join(process.cwd(), "public");
const outDir = path.join(process.cwd(), "captions", "out");
fs.mkdirSync(outDir, { recursive: true });

console.log("Installing whisper.cpp (one-time)...");
await installWhisperCpp({ to: WHISPER_PATH, version: WHISPER_VERSION });
console.log(`Downloading ${WHISPER_MODEL} model (one-time, ~1.5GB)...`);
await downloadWhisperModel({ folder: WHISPER_PATH, model: WHISPER_MODEL });

for (const name of CLIPS) {
  const wavIn = path.join(publicDir, `${name}.wav`);
  const wav16k = path.join(outDir, `${name}-16k.wav`);
  // whisper.cpp requires 16kHz mono input.
  execSync(
    `ffmpeg -y -i "${wavIn}" -ar 16000 -ac 1 -c:a pcm_s16le "${wav16k}"`,
    { stdio: "inherit" },
  );

  console.log(`Transcribing ${name}...`);
  const whisperCppOutput = await transcribe({
    inputPath: wav16k,
    whisperPath: WHISPER_PATH,
    whisperCppVersion: WHISPER_VERSION,
    model: WHISPER_MODEL,
    tokenLevelTimestamps: true,
    splitOnWord: true,
    printOutput: false,
  });

  const { captions } = toCaptions({ whisperCppOutput });
  const outPath = path.join(outDir, `${name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(captions, null, 2));
  console.log(`  -> ${outPath} (${captions.length} words)`);
}

console.log("Done.");
