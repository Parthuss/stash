"""Private owner-console projection and hash-bound commands; never a publishing bypass."""
from __future__ import annotations

import json
import os
from pathlib import Path

from .quality_gate import record_digest, record_problems

ENGINE = Path(__file__).resolve().parents[1]
SETUP = 'https://github.com/Parthuss/stash/blob/master/promo/engine/SETUP.md'


def ideas() -> list[dict]:
    plan = json.loads((ENGINE / 'research/quality-run-2026-11-12.json').read_text())
    rows = []
    for draft in plan.get('drafts', []):
        hook = draft.get('hook', '')
        selected = next((h for h in draft.get('hook_candidates', []) if h.get('text') == hook), {})
        rows.append({'id': draft['id'], 'hook': hook, 'format': draft.get('format_id', draft.get('kind')),
                     'score': selected.get('score'), 'score_label': 'Heuristic score, not predicted reach'})
    return rows


def setup(cfg, paused_state: dict) -> list[dict]:
    fields = [('instagram', 'Instagram', cfg.has_instagram, 'instagram'),
              ('youtube', 'YouTube', cfg.has_youtube, 'youtube'),
              ('r2', 'Private R2 bucket', bool(cfg.r2_bucket), 'r2'),
              ('telegram', 'Telegram', cfg.has_telegram, 'telegram'),
              ('engine', 'Engine enabled', os.environ.get('ENGINE_ENABLED') == '1', 'engine'),
              ('dry_run', 'Dry run', cfg.dry_run or bool(paused_state.get('dry_run')), 'dry_run')]
    return [{'key': key, 'label': label, 'connected': bool(connected),
             'status': ('On' if connected else 'Off') if key in ('engine', 'dry_run') else ('Configured' if connected else 'Not connected'),
             'href': SETUP + '#' + anchor} for key, label, connected, anchor in fields]


def summary(ctx) -> dict:
    from .publisher import load_posts, when_of
    state = ctx.store.get_json('state/paused.json') or {}
    result = {'updated_at': ctx.now().isoformat(), 'setup': setup(ctx.cfg, state), 'ideas': ctx.store.get_json('dashboard/ideas.json') or ideas(),
              'drafts': [], 'scheduled': [], 'posted': [], 'controls': {'paused': bool(state.get('paused'))},
              'note': 'Setup reports configured credentials; connection health is verified by the next engine run. Approval requests apply on the next tick.'}
    for post in load_posts(ctx.store, ctx):
        errors = record_problems(ctx, post)
        report = ctx.store.get_json(post.get('quality_report_key', '')) if post.get('quality_report_key') else {}
        keys = post.get('media_keys', [])
        row = {'id': post['id'], 'title': post.get('title') or post['id'], 'format': post.get('kind'),
               'status': post.get('status'), 'when': post.get('when'), 'tz': post.get('tz'),
               'caption': (post.get('instagram') or {}).get('caption') or (post.get('youtube') or {}).get('description', ''),
               'content_hash': record_digest(post), 'preview': {'cover': post.get('cover_key'),
                   'slides': keys if post.get('kind') in ('carousel', 'static') else [],
                   'video': keys[0] if keys and post.get('kind') in ('reel', 'short') else None},
               'gate': {'passed': not errors, 'summary': 'PASS: copy, media and independent review bound to this draft' if not errors else '; '.join(errors),
                        'issues': errors, 'scores': (report or {}).get('judge', {}).get('scores', {})},
               'scheduled_at': when_of(post).isoformat(),
               'platform': ' + '.join(plat for plat in ('instagram', 'youtube') if post.get(plat)),
               'posted_at': next((r.get('published_at') for r in (post.get('results') or {}).values() if r.get('published_at')), None),
               'metrics': {label: {plat: r.get('metrics', {}).get(snap) for plat, r in (post.get('results') or {}).items()}
                           for label, snap in (('48h', 'h48'), ('7d', 'd7'))}}
        if post.get('status') == 'done':
            result['posted'].append(row)
        elif post.get('status') == 'approved':
            result['scheduled'].append(row)
        elif post.get('status') != 'skipped':
            result['drafts'].append(row)
    return result


def export(ctx) -> dict:
    data = summary(ctx)
    ctx.store.put_json('dashboard/summary.json', data)
    return data


def apply_commands(ctx) -> None:
    from .publisher import POST_ID, apply_action
    for key in ctx.store.list('commands/pending/'):
        if not key.endswith('.json'):
            continue
        receipt_key = key.replace('commands/pending/', 'commands/results/', 1)
        if ctx.store.exists(receipt_key):
            ctx.store.delete(key)
            continue
        command = ctx.store.get_json(key) or {}
        pid = str(command.get('id', ''))
        post = ctx.store.get_json(f'posts/{pid}.json') if POST_ID.fullmatch(pid) else None
        if not post or command.get('hash') != record_digest(post):
            message = 'Draft changed or missing. Refresh and review it again.'
        elif command.get('action') not in ('approve', 'skip'):
            message = 'Unknown action.'
        else:
            # Same full media/report/policy validation and transitions as Telegram.
            message = apply_action(ctx, post, 'ap' if command['action'] == 'approve' else 'sk')
        ctx.store.put_json(receipt_key, {'id': pid, 'message': message, 'at': ctx.now().isoformat()})
        ctx.store.delete(key)
