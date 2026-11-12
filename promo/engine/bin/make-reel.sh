#!/bin/sh
# Render, master and collect QA evidence for one Reel (the make step's reel pipeline, after the
# composition, VO, captions and music are built). It never grants a QA verdict: run the content-qa
# skill on POSTDIR/qa/evidence and write POSTDIR/qa/report.md yourself.
#
#   promo/engine/bin/make-reel.sh ENTRY COMPOSITION POSTDIR SLUG [COVER_FRAME]
#   e.g. make-reel.sh src/insta/index.ts NoNoYes promo/out/engine/week-2026-11-17/01-no-no-yes no-no-yes 0
#
# ENTRY is relative to promo/ (an isolated entry, never Parth's src/Root.tsx). Output:
#   POSTDIR/SLUG.mp4  1080x1920 30 fps H.264 CRF 18, cover still on frame 0, loudnorm -14 LUFS / -1 dBTP, faststart
#   POSTDIR/cover.png the cover still
#   POSTDIR/qa/evidence/  probe.txt, loudness.txt (whole file), sheet-*.png (2 fps), cuts.txt, audio.wav (16 kHz for whisper)
# After Whisper transcribes that extracted audio and the renderer exports actual word boxes:
#   make-reel.sh --evidence POSTDIR SLUG
# qa/transcript.json: {video_sha256,audio_sha256,words:[{text,start,end}]}
# qa/rendered-evidence.json: {video_sha256,captions:{burned_in:true,words:[{text,start,end,bbox,lines}]},key_text_boxes:[{bbox}]}
# These files must describe this exact render. No script-derived transcript or guessed boxes.
set -eu
EVIDENCE_ONLY=0
if [ "${1:-}" = --evidence ]; then
  [ $# -eq 3 ] || { echo 'usage: make-reel.sh --evidence POSTDIR SLUG'; exit 2; }
  EVIDENCE_ONLY=1; POST=$2; SLUG=$3
else
  [ $# -ge 4 ] || { sed -n 2,14p "$0"; exit 2; }
  ENTRY=$1; COMP=$2; POST=$3; SLUG=$4; COVER_FRAME=${5:-0}
fi
PROMO=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$POST/qa/evidence"; POST=$(cd "$POST" && pwd); EV="$POST/qa/evidence"
OUT="$POST/$SLUG.mp4"
if [ "$EVIDENCE_ONLY" = 0 ]; then
RAW="$POST/raw-$SLUG.mp4"
[ -e "$RAW.lock" ] && { echo "a render into $RAW is already running"; exit 1; }
trap 'rm -f "$RAW.lock"' EXIT; : > "$RAW.lock"     # never two renders into one file

cd "$PROMO"
npx remotion render "$ENTRY" "$COMP" "$RAW"
npx remotion still "$ENTRY" "$COMP" "$POST/cover.png" --frame="$COVER_FRAME"
ffmpeg -y -v error -i "$RAW" -i "$POST/cover.png" \
  -filter_complex "[1:v]scale=1080:1920[c];[0:v][c]overlay=enable='eq(n,0)'[v]" -map "[v]" -map "0:a?" \
  -c:v libx264 -crf 18 -pix_fmt yuv420p -af "loudnorm=I=-14:TP=-1:LRA=9" -ar 48000 -c:a aac -b:a 192k \
  -movflags +faststart "$POST/$SLUG.mp4"
rm -f "$RAW"

OUT="$POST/$SLUG.mp4"
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,duration -of compact "$OUT" > "$EV/probe.txt"
ffmpeg -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | tail -14 > "$EV/loudness.txt"
rm -f "$EV"/sheet-*.png
ffmpeg -v error -i "$OUT" -vf "fps=2,scale=270:-1,tile=6x4" "$EV/sheet-%02d.png"
ffmpeg -i "$OUT" -vf "select='gt(scene,0.3)',showinfo" -vsync vfr -f null - 2>&1 | grep -o "pts_time:[0-9.]*" > "$EV/cuts.txt" || true
ffmpeg -y -v error -i "$OUT" -ar 16000 -ac 1 "$EV/audio.wav"
[ -f "$POST/qa/report.md" ] && { cp "$POST/qa/report.md" "$POST/qa/report.previous.md"; }
printf 'Verdict: PENDING\n\nNew render. Run content-qa on qa/evidence (whisper on audio.wav, per-section ebur128, sheets, cuts on the 15-frame grid) and replace this file.\n' > "$POST/qa/report.md"
cat "$EV/probe.txt"; grep -E "I:|Peak:" "$EV/loudness.txt" || true
echo "rendered $OUT; QA pending"
fi
python3 - "$POST" "$SLUG" "$EVIDENCE_ONLY" <<'PYTHON'
import hashlib, json, sys
from pathlib import Path
post, slug, evidence_only = Path(sys.argv[1]), sys.argv[2], sys.argv[3] == '1'
qa = post / 'qa'
video_hash = hashlib.sha256((post / f'{slug}.mp4').read_bytes()).hexdigest()
audio = qa / 'evidence/audio.wav'
audio_hash = hashlib.sha256(audio.read_bytes()).hexdigest()
sheets = sorted(qa.glob('evidence/sheet-*.png'))
manifest = {'viewer_files': [str(p.relative_to(post)) for p in sheets] + ['cover.png', 'qa/evidence/audio.wav'],
            'key_text_boxes': [], 'video_sha256': video_hash, 'captions': {}, 'transcript': {}}
missing = []
for name, fields in (('transcript.json', ('words',)), ('rendered-evidence.json', ('captions', 'key_text_boxes'))):
    try:
        data = json.loads((qa / name).read_text())
        if data.get('video_sha256') != video_hash:
            raise ValueError('video hash mismatch')
        if name == 'transcript.json' and data.get('audio_sha256') != audio_hash:
            raise ValueError('extracted audio hash mismatch')
        if not all(data.get(field) for field in fields):
            raise ValueError('required evidence missing')
        if name == 'transcript.json':
            manifest['transcript'] = {'words': data['words']}
        else:
            manifest.update({field: data[field] for field in fields})
        manifest['viewer_files'].append('qa/' + name)
    except (OSError, ValueError, TypeError):
        missing.append(name + ': missing or not bound to the actual rendered video/audio')
if not sheets:
    missing.append('no rendered contact sheets')
manifest['pending'] = missing
(qa / 'evidence.json').write_text(json.dumps(manifest, indent=2) + '\n')
(qa / 'quality-report.json').unlink(missing_ok=True)
(qa / 'report.md').write_text('Verdict: PENDING\n\nRender/evidence changed. Run independent content-qa and mandatory quality validation.\n')
print('Maker evidence: ' + ('PENDING: ' + '; '.join(missing) if missing else 'collected; independent reviews still required'))
if missing and evidence_only:
    raise SystemExit(1)
PYTHON
