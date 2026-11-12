"""Deterministic copy checks. Semantic completeness is separately checked by a judge.

No string scanner can prove arbitrary natural-language claims true. Approved claims
are exact catalogue copy; the independent judge must audit every public text unit.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path

PLAYBOOKS = Path(__file__).resolve().parents[1] / 'playbooks'


def catalogue() -> dict:
    return json.loads((PLAYBOOKS / 'features.json').read_text())


def public_units(draft: dict) -> list[dict]:
    """Only audience-facing text, never shot notes, source excerpts or judge prompts."""
    out = []
    def add(path, text):
        if isinstance(text, str) and text.strip():
            out.append({'path': path, 'text': text.strip()})
    for key in ('hook', 'caption', 'cta'):
        add(key, draft.get(key))
    for group, fields in [('beats', ('on_screen', 'vo')), ('slides', ('title', 'body', 'text', 'bridge', 'kicker', 'label', 'card_title', 'card', 'pill', 'panel', 'from', 'to', 'stamp', 'tile_label', 'arrow_label'))]:
        for i, row in enumerate(draft.get(group, [])):
            for field in fields:
                add(f'{group}.{i}.{field}', row.get(field))
    # Renderer defaults and nested labels are audience-facing too. Inventory them
    # explicitly so a label cannot bypass truth/slop checks or the editor packet.
    for i, row in enumerate(draft.get('slides', [])):
        for group in ('tiles', 'crops'):
            for j, item in enumerate(row.get(group, [])):
                if group == 'tiles' and item.get('gone'):
                    add(f'slides.{i}.{group}.{j}.label', item.get('label', 'Reel unavailable'))
                else:
                    add(f'slides.{i}.{group}.{j}.label', item.get('label'))
        if row.get('layout'):
            if row['layout'] != 'cta':
                add(f'slides.{i}.brand', 'Skwirl')
                add(f'slides.{i}.count', f"{i+1}/{len(draft['slides'])}")
            if row['layout'] == 'hook':
                add(f'slides.{i}.panel', row.get('panel', 'Saved'))
            if row['layout'] == 'statement':
                for field, default in (('from', 'Your save'), ('to', 'Their post'), ('stamp', 'Deleted')):
                    add(f'slides.{i}.{field}', row.get(field, default))
            if row['layout'] == 'cta':
                add(f'slides.{i}.label', row.get('label', 'skwirl.app'))
    return out


def reading_grade(text: str) -> float:
    # Transparent Flesch-Kincaid estimate; short fragments are noisy, so assess body.
    words = re.findall(r"[A-Za-z]+(?:'[a-z]+)?", text)
    if not words:
        return 0.0
    sentences = max(1, len(re.findall(r'[.!?]+', text)))
    def syllables(word):
        w = word.lower()
        n = len(re.findall(r'[aeiouy]+', w))
        if w.endswith('e') and not w.endswith(('le', 'ye')):
            n -= 1
        return max(1, n)
    return round(0.39 * len(words) / sentences + 11.8 * sum(map(syllables, words)) / len(words) - 15.59, 2)


def validate_copy(draft: dict, platforms: dict | None = None, repo_root: Path | None = None) -> list[dict]:
    errors = []
    def fail(code, detail):
        errors.append({'code': code, 'detail': detail})
    cat = catalogue()
    features = {x['id']: x for x in cat['features']}
    style = json.loads((PLAYBOOKS / 'style.json').read_text())
    units = public_units(draft)
    if not units or not draft.get('hook') or not draft.get('caption') or not draft.get('cta'):
        fail('copy.required', 'hook, caption and cta are required')
    if len(re.findall(r'\S+', draft.get('hook', ''))) > style['max_hook_words']:
        fail('style.hook_length', 'hook exceeds 12 words; simplify for frame-zero readability')
    for fid in draft.get('feature_ids', []):
        if fid not in features:
            fail('truth.feature', f'Unknown feature: {fid}')
    if not draft.get('feature_ids'):
        fail('truth.feature', 'No supported features selected')
    if repo_root:
        for fid in draft.get('feature_ids', []):
            for src in features.get(fid, {}).get('sources', []):
                p = repo_root / src['path']
                if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest() != src['sha256']:
                    fail('truth.stale_source', f"Re-verify catalogue source {src['path']}")
    claim_text = []
    for c in draft.get('claims', []):
        fid, text = c.get('feature_id'), c.get('text', '')
        if fid not in features or text not in features.get(fid, {}).get('approved_copy', []):
            fail('truth.claim', f'Claim is not approved catalogue copy: {text!r}')
        if not text or not any(text in u['text'] for u in units):
            fail('truth.claim_location', 'Claim must appear in audience-facing output')
        if fid not in draft.get('feature_ids', []):
            fail('truth.claim_feature', 'Claim feature not selected by draft')
        claim_text.append(text)
    if not claim_text:
        fail('truth.claims_missing', 'At least one mapped, approved product claim is required')
    quotes = cat['testimonial']['allowed_quotes']
    attribution = cat['testimonial']['attribution']
    combined = '\n'.join(u['text'] for u in units)
    if re.search(r'\bjacinda\b', combined, re.I):
        # Every occurrence needs the precise attribution; never allow a made-up quote beside a real one.
        if re.search(r'\bjacinda\b', combined.replace(attribution, ''), re.I):
            fail('truth.testimonial_name', 'Only Jacinda, occupational therapist is authorised')
        quote = draft.get('testimonial', {}).get('quote')
        if quote not in quotes or not any(quote in u['text'] and attribution in u['text'] for u in units):
            fail('truth.testimonial_quote', 'Exact authorised quote and attribution must occur together')
        if draft.get('testimonial', {}).get('attribution') != attribution:
            fail('truth.testimonial_attribution', 'Exact authorised attribution required')
    elif draft.get('testimonial'):
        fail('truth.testimonial_name', 'Testimonial metadata without authorised displayed attribution')
    for unit in units:
        text = unit['text']
        # Quote exemption is exact, never applies to claims or invented testimonials.
        own = text
        for q in quotes:
            own = own.replace(q, '')
        if '\u2014' in text:
            fail('style.em_dash', unit['path'])
        if re.search(r'open[\s-]?source|#opensource', text, re.I):
            fail('truth.licence', 'Skwirl is FSL-1.1-MIT, source-available')
        if re.search(r'\b(?:tiktok|threads|unlimited|instant(?:ly)?)\b|app store|play store', text, re.I):
            fail('truth.unsupported', unit['path'])
        # Restrict the automatic wording to one exact approved sentence. Nearby Claude Code is insufficient.
        if re.search(r'\bautomat(?:ic(?:ally)?|ed|ion)\b|\bautopilot\b', text, re.I):
            allowed = features['claude_code']['claim']
            if re.search(r'\bautomat\w*\b|\bautopilot\b', text.replace(allowed, ''), re.I):
                fail('truth.automatic', 'Only the approved Claude Code automatic claim is permitted')
        for phrase in style['banned_phrases']:
            if re.search(r'(?<!\w)' + re.escape(phrase) + r'(?!\w)', own, re.I):
                fail('style.slop', f"{unit['path']}: {phrase}")
        # Block quantitative performance/social proof, not numbered instructions or list cardinality.
        if re.search(r'\b\d[\d,.]*\s*(?:%|percent|users?|customers?|hours?|minutes?|seconds?|x\b|times faster)|\b\d[\d,.]*[xX]\b|\b\d[\d,.]*\s*[- ]star', own, re.I):
            fail('truth.number', f"Unsupported numerical outcome at {unit['path']}")
        if re.search(r'\b(?:testimonial|customer says|users say|everyone loves|rated five stars)\b', own, re.I):
            fail('truth.social_proof', unit['path'])
    caption = draft.get('caption', '')
    if not re.search(r'\blink in (?:my |our |the )?bio\b', caption, re.I):
        fail('style.bio', 'Instagram copy requires link in bio wording')
    if not draft.get('cta', '').strip() or draft.get('cta', '').strip() not in caption:
        fail('style.cta', 'CTA must be present verbatim in caption')
    text_lines = [line for line in caption.splitlines() if line.strip() and not line.lstrip().startswith('#')]
    if len(text_lines) > style['max_caption_lines']:
        fail('style.caption_lines', 'Use at most two copy lines plus a hashtag line')
    body = ' '.join(u['text'] for u in units if u['path'] != 'caption')
    for q in quotes:
        body = body.replace(q, '')
    grade = reading_grade(body)
    if grade > style['max_reading_grade']:
        fail('style.reading_grade', f'Estimated grade {grade} exceeds 8')
    platforms = platforms or {'instagram': {'caption': caption}}
    for name, data in platforms.items():
        if not data:
            continue
        cap = data.get('caption', '') if name == 'instagram' else data.get('description', '')
        limit = style['instagram_caption_chars'] if name == 'instagram' else style['youtube_description_chars']
        if len(cap) > limit:
            fail('platform.caption_length', name)
        if len(re.findall(r'(?<!\w)#\w+', cap)) > style['max_hashtags']:
            fail('style.hashtags', name)
        if name == 'instagram' and cap.strip() != caption.strip():
            fail('copy.caption_mismatch', 'Scheduled Instagram caption differs from reviewed draft')
        if name == 'youtube':
            title = data.get('title', '')
            if not title.strip() or len(title) > style['youtube_title_chars'] or re.search(r'[<>]', title):
                fail('platform.title', 'YouTube title must be 1-100 characters without < or >')
            # All platform-specific copy must be in the judge packet, not just the IG caption.
            if not re.search(r'\b(?:try|find|save|visit|open|search|share|watch)\b', cap, re.I):
                fail('style.cta', 'YouTube description needs an action')
    return errors
