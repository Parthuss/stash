"""Structural checks on plans, before rendering costs are incurred."""
from __future__ import annotations
import math


def validate_script(draft: dict) -> list[dict]:
    errors = []
    def fail(detail):
        errors.append({'code': 'script.structure', 'detail': detail})
    if draft.get('kind') == 'reel':
        rows = draft.get('beats', [])
        if len(rows) < 4:
            fail('Reels need hook, re-hook, payoff and CTA beats')
        elif rows[0].get('role') != 'hook' or rows[-1].get('role') != 'cta' or not {'re-hook', 'payoff'} <= {x.get('role') for x in rows}:
            fail('Missing hook/re-hook/payoff/CTA story order')
        end = 0.0
        for row in rows:
            try:
                start, stop = float(row['t_start']), float(row['t_end'])
                if not all(math.isfinite(n) for n in (start, stop)) or abs(start-end) > .05 or stop <= start:
                    fail('Beat times must be contiguous, finite and positive')
                end = stop
                if not row.get('vo') or not row.get('on_screen') or not row.get('shot'):
                    fail('Every beat needs VO, on-screen text and shot notes')
                if len(row.get('vo', '').split()) / (stop-start) > 3.5:
                    fail('Voiceover is too fast for the assigned beat')
            except (KeyError, TypeError, ValueError, ZeroDivisionError):
                fail('Malformed timed beat')
        if end > 60:
            fail('Reel exceeds house 60-second ceiling')
        if rows and rows[0].get('on_screen') != draft.get('hook'):
            fail('Frame-zero text must contain the reviewed hook verbatim')
    elif draft.get('kind') in ('carousel', 'static'):
        slides = draft.get('slides', [])
        static = draft.get('kind') == 'static'
        if (len(slides) != 1 if static else not 2 <= len(slides) <= 20):
            fail('Static needs one slide; carousel must have 2-20 slide jobs')
        if slides and not static and (slides[0].get('job') != 'hook' or slides[-1].get('job') != 'cta'):
            fail('Carousel must open with hook and end in CTA')
        for i, slide in enumerate(slides):
            if slide.get('n') != i+1 or not slide.get('job') or not slide.get('text') or not slide.get('visual'):
                fail('Every slide needs sequential n, job, text and visual notes')
            if i < len(slides)-1 and not slide.get('bridge'):
                fail('Each slide must hand the reader to the next one')
        if slides and slides[0].get('text') != draft.get('hook'):
            fail('First slide text must match the reviewed hook')
    else:
        fail('Structured drafts must be reel, carousel or static')
    return errors
