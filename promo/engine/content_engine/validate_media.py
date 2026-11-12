"""Measure actual assets with ffprobe/ffmpeg; never trust generation metadata."""
from __future__ import annotations

import json
import math
import re
import subprocess
from fractions import Fraction
from pathlib import Path


def probe(path: Path) -> dict:
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)],
                       check=True, capture_output=True, text=True, timeout=60)
    return json.loads(r.stdout)


def measure_loudness(path: Path) -> dict:
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af',
                        'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-'],
                       check=True, capture_output=True, text=True, timeout=300)
    chunks = re.findall(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr, re.S)
    if not chunks:
        raise ValueError('ffmpeg loudness measurements absent')
    d = json.loads(chunks[-1])
    return {'integrated_lufs': float(d['input_i']), 'true_peak_dbtp': float(d['input_tp'])}


def words(text):
    return re.findall(r"[\w']+", text.casefold())


def validate_captions(captions: dict, transcript: dict, duration: float) -> list[dict]:
    errors = []
    def fail(detail):
        errors.append({'code': 'media.captions', 'detail': detail})
    cap, spoken = captions.get('words', []), transcript.get('words', [])
    if not cap or not spoken:
        return [{'code': 'media.captions', 'detail': 'Word-timed rendered captions and independent transcript required'}]
    if [words(x.get('text', '')) for x in cap] != [words(x.get('text', '')) for x in spoken]:
        fail('Rendered words differ from independent audio transcript')
    last_start = -1
    for i, row in enumerate(cap):
        try:
            start, end = float(row['start']), float(row['end'])
            if not all(math.isfinite(x) for x in (start, end)) or not 0 <= start < end <= duration or start < last_start:
                fail('Invalid caption timing/order')
            last_start = start
            if i < len(spoken) and (abs(start - float(spoken[i]['start'])) > .15 or abs(end - float(spoken[i]['end'])) > .15):
                fail('Caption/audio alignment exceeds 0.15s')
            x, y, w, h = map(float, row['bbox'])
            if not all(math.isfinite(n) for n in (x, y, w, h)) or w <= 0 or h <= 0 or x < 60 or x + w > 1020 or y < 220 or y + h > 1540:
                fail('Caption box outside Skwirl safe zone')
            if type(row['lines']) is not int or not 1 <= row['lines'] <= 2:
                fail('Caption exceeds two lines')
        except (KeyError, TypeError, ValueError, OverflowError):
            fail('Malformed word/caption box evidence')
    return errors


def validate_media(post: dict, directory: Path, evidence: dict) -> tuple[list[dict], dict]:
    errors, measured = [], {'assets': []}
    def fail(code, detail):
        errors.append({'code': code, 'detail': detail})
    media = post.get('media', [])
    kind = post.get('kind')
    if kind not in ('reel', 'carousel', 'static'):
        fail('media.kind', 'Unknown format')
    if kind == 'reel' and len(media) != 1:
        fail('media.count', 'A reel needs exactly one media file')
    if kind == 'carousel':
        if not 2 <= len(media) <= 20:
            fail('media.count', 'Carousel must have 2-20 slides')
        if len(media) > 10:
            fail('media.api_limit', '11-20 slides require manual native publishing; engine API supports at most 10')
    if kind == 'static' and len(media) != 1:
        fail('media.count', 'A static needs exactly one image')
    if not media:
        fail('media.missing', 'No rendered assets')
    for name in media:
        path = directory / name
        if not path.is_file() or not path.resolve().is_relative_to(directory.resolve()):
            fail('media.path', f'Missing or unsafe media path: {name}')
            continue
        size = path.stat().st_size
        if size <= 0:
            fail('media.empty', name)
        try:
            info = probe(path)
            videos = [s for s in info['streams'] if s['codec_type'] == 'video']
            video = videos[0]
            w, h = video['width'], video['height']
            asset = {'name': name, 'width': w, 'height': h, 'size_bytes': size}
            if kind == 'reel':
                duration = float(info['format']['duration'])
                asset['duration_s'] = duration
                if (w, h) != (1080, 1920):
                    fail('media.resolution', 'Reel requires 1080x1920 (9:16)')
                # House policy: <=60s even though platform Shorts can be up to three minutes.
                if not math.isfinite(duration) or not 3 <= duration <= 60:
                    fail('media.duration', 'House reel/Shorts policy is 3-60 seconds')
                if size > 1024 ** 3:
                    fail('media.size', 'Reel exceeds 1 GiB API ceiling')
                fps = float(Fraction(video['r_frame_rate']))
                if abs(fps - 30) > .02:
                    fail('media.fps', 'House content-qa policy requires 30 fps')
                if video.get('codec_name') not in ('h264', 'hevc') or path.suffix.lower() not in ('.mp4', '.mov'):
                    fail('media.codec', 'MP4/MOV with H.264 or HEVC required')
                audio = [s for s in info['streams'] if s['codec_type'] == 'audio']
                if not audio or audio[0].get('codec_name') != 'aac' or int(audio[0].get('sample_rate', 0)) != 48000:
                    fail('media.audio', 'AAC 48 kHz audio required')
                loudness = measure_loudness(path)
                asset.update(loudness)
                if not math.isfinite(loudness['integrated_lufs']) or abs(loudness['integrated_lufs'] + 14) > 1:
                    fail('media.loudness', 'Integrated target -14 LUFS +/-1')
                if not math.isfinite(loudness['true_peak_dbtp']) or loudness['true_peak_dbtp'] > -1:
                    fail('media.peak', 'True peak must be <= -1 dBTP')
                errors.extend(validate_captions(evidence.get('captions', {}), evidence.get('transcript', {}), duration))
                if evidence.get('captions', {}).get('burned_in') is not True:
                    fail('media.captions', 'Rendered burned-in captions must be confirmed by viewer')
                expected = post.get('duration_s')
                if expected is not None and (not math.isfinite(float(expected)) or abs(duration - float(expected)) > 1):
                    fail('media.duration_brief', 'Rendered duration differs from brief by >1s')
            else:
                if (w, h) != (1080, 1350):
                    fail('media.resolution', 'Carousel/static house format is 1080x1350')
                if size > 8 * 1024 ** 2:
                    fail('media.size', 'Image exceeds 8 MiB')
            measured['assets'].append(asset)
        except (OSError, subprocess.SubprocessError, ValueError, KeyError, IndexError, TypeError, OverflowError) as exc:
            fail('media.measurement', f'{name}: cannot measure ({type(exc).__name__})')
    # Safe-zone boxes come from the renderer + the independent visual pass, not guessed from dimensions.
    boxes = evidence.get('key_text_boxes', [])
    if not boxes:
        fail('media.safe_zones', 'Rendered key-text boxes required')
    for box in boxes:
        try:
            x, y, w, h = map(float, box['bbox'])
            width, height = (1080, 1920) if kind == 'reel' else (1080, 1350)
            top, bottom = (220, 380) if kind == 'reel' else (60, 60)
            if not all(math.isfinite(n) for n in (x,y,w,h)) or min(w,h) <= 0 or x < 60 or x+w > width-60 or y < top or y+h > height-bottom:
                fail('media.safe_zones', 'Key text lies outside safe zones')
        except (KeyError, TypeError, ValueError):
            fail('media.safe_zones', 'Malformed key-text box')
    return errors, measured
