"""Quality gate entry point. Writes JSON reports; only final PASS can be staged.

Maker contract is documented in playbooks/INTEGRATION.md. Plans are deliberately
not approvable without real rendered media and independent evidence.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from .quality_judge import digest, judge_packet, validate_judge, validate_viewer
from .validate_copy import PLAYBOOKS, public_units, validate_copy
from .validate_media import validate_media
from .validate_scripts import validate_script

REPORT_VERSION = 1


def load_json(path: Path):
    def reject(value):
        raise ValueError('Non-finite JSON constant: '+value)
    return json.loads(path.read_text(), parse_constant=reject)



def policy_digest() -> str:
    # A code/policy change invalidates old reports at approval/publish too.
    paths = [PLAYBOOKS / name for name in ('features.json', 'style.json')]
    paths += [Path(__file__).with_name(name) for name in
              ('validate.py', 'validate_copy.py', 'validate_media.py', 'quality_judge.py', 'quality_gate.py', 'validate_scripts.py', 'ideation.py', 'hooks.py')]
    return digest({p.name: p.read_text() for p in paths})


def hashes(directory: Path, names: list[str]) -> dict:
    import hashlib
    result = {}
    for name in names:
        p = directory / name
        if not p.is_file() or not p.resolve().is_relative_to(directory.resolve()):
            raise ValueError(f'Missing or unsafe evidence file: {name}')
        result[name] = hashlib.sha256(p.read_bytes()).hexdigest()
    return result


def report_for(post: dict, directory: Path, draft: dict, history: list[dict],
               judge: dict | None = None, viewer: dict | None = None, evidence: dict | None = None,
               repo_root: Path | None = None, now: datetime | None = None, weeks: int = 6) -> dict:
    now = now or datetime.now(timezone.utc)
    evidence = evidence or {}
    errors = []
    platforms = {k: post[k] for k in ('instagram', 'youtube') if post.get(k)}
    errors += validate_script(draft)
    errors += validate_copy(draft, platforms, repo_root)
    # Screen platform-specific copy with the same rules, not only the Instagram master.
    for name, fields in platforms.items():
        if name == 'youtube':
            extra = dict(draft, hook=fields.get('title', ''), caption=fields.get('description', ''),
                         cta=draft.get('cta', ''))
            # Full truth/slop scan; bio CTA wording is retained as house cross-post policy.
            errors += validate_copy(extra, {name: fields})
    if draft.get('kind') != post.get('kind'):
        errors.append({'code': 'copy.kind', 'detail': 'Draft and scheduled media format differ'})
    # Independently inventory final editable copy and caption; a reviewed script alone isn't the final output.
    if post.get('kind') in ('carousel','static') and not (directory / 'copy.json').exists():
        errors.append({'code':'copy.missing','detail':'Final editable copy.json is required for stills'})
    for name in ('caption.txt', 'copy.json'):
        p = directory / name
        if p.exists():
            try:
                if name == 'caption.txt' and p.read_text().strip() != draft.get('caption', '').strip():
                    errors.append({'code': 'copy.caption_mismatch', 'detail': name})
                if name == 'copy.json':
                    copy = load_json(p)
                    final_strings = []
                    def inventory(value, key=''):
                        # Only renderer controls/asset references are non-public. Unknown text is copy.
                        if key in ('id','kind','layout','template','image','image_path','art','art_path','src','font','color',
                                   'bg','arrange','screen','tile','asset','label_at','job','visual','feature_ids'):
                            return
                        if isinstance(value,str) and value.strip():
                            final_strings.append(value.strip())
                        elif isinstance(value,dict):
                            for field, item in value.items():
                                inventory(item,field)
                        elif isinstance(value,list):
                            for item in value:
                                inventory(item)
                    for slide in copy.get('slides', []):
                        inventory(slide)
                    public = {u['text'] for u in public_units(draft)}
                    for text in final_strings:
                        if text not in public:
                            errors.append({'code': 'copy.unreviewed', 'detail': f'Final copy not in reviewed draft: {text[:80]}'})
            except (ValueError, TypeError, AttributeError):
                errors.append({'code': 'copy.malformed', 'detail': name})
    packet = judge_packet(draft, history, platforms)
    errors += validate_judge(judge, packet)
    if post.get('kind') == 'reel':
        from .validate_media import words
        spoken = ' '.join(row.get('text','') for row in evidence.get('transcript',{}).get('words',[]))
        reviewed = ' '.join(row.get('vo','') for row in draft.get('beats',[]))
        if words(spoken) != words(reviewed):
            errors.append({'code':'truth.rendered_vo','detail':'Independent transcript differs from reviewed VO'})
    measured_errors, measured = validate_media(post, directory, evidence)
    errors += measured_errors
    names = list(post.get('media', []))
    if post.get('cover'):
        names.append(post['cover'])
    names += [n for n in ('caption.txt', 'copy.json', 'content.json', 'qa/evidence.json') if (directory / n).exists()]
    names += evidence.get('viewer_files', [])
    asset_hashes = {}
    try:
        asset_hashes = hashes(directory, names)
    except (ValueError, OSError) as exc:
        errors.append({'code': 'evidence.files', 'detail': str(exc)})
    viewer_digest = digest({'hashes': asset_hashes, 'caption': draft.get('caption'), 'evidence': evidence})
    if not evidence.get('viewer_files'):
        errors.append({'code': 'quality.viewer_inputs', 'detail': 'Rendered contact sheets and independently transcribed audio required'})
    errors += validate_viewer(viewer, viewer_digest)
    if judge and viewer and (judge.get('reviewer') == viewer.get('reviewer')):
        errors.append({'code': 'quality.independence', 'detail': 'Editor and fresh-eyes viewer must be separate review sessions'})
    from .ideation import find_duplicates
    try:
        matches = [m for m in find_duplicates([draft.get('hook', ''), draft.get('question', '')], history, weeks=weeks, now=now) if m['blocking']]
    except (TypeError, ValueError) as exc:
        matches = []
        errors.append({'code': 'duplicate.history', 'detail': str(exc)})
    if matches:
        errors.append({'code': 'duplicate.recency', 'detail': matches})
    if not history:
        errors.append({'code': 'duplicate.history_missing', 'detail': 'History is required; use read_history, do not pass an empty list'})
    return {'version': REPORT_VERSION, 'verdict': 'FAIL' if errors else 'PASS',
            'post_id': post.get('id'), 'created_at': now.isoformat(), 'policy_digest': policy_digest(),
            'post_digest': digest(post), 'draft_digest': digest(draft), 'history_digest': digest(history),
            'weeks': weeks, 'hashes': asset_hashes, 'viewer_input_digest': viewer_digest,
            'judge': judge, 'viewer': viewer, 'measured': measured, 'errors': errors}


def validate_post(post: dict, directory: Path, history: list[dict], repo_root: Path | None = None,
                  now: datetime | None = None, judge_model=None, viewer_model=None) -> dict:
    """Load Maker evidence and persist even failing reports. No Telegram/network side effects."""
    qa = directory / 'qa'
    qa.mkdir(exist_ok=True, parents=True)
    (qa / 'quality-report.json').unlink(missing_ok=True)
    try:
        draft = load_json(directory / 'content.json')
        evidence = load_json(qa / 'evidence.json') if (qa / 'evidence.json').exists() else {}
        judge = load_json(qa / 'judge.json') if (qa / 'judge.json').exists() else None
        viewer = load_json(qa / 'viewer.json') if (qa / 'viewer.json').exists() else None
        if judge_model:
            from .quality_judge import run_judge
            platforms = {k:post[k] for k in ('instagram','youtube') if post.get(k)}
            judge = run_judge(draft, history, judge_model, platforms)
            (qa / 'judge.json').write_text(json.dumps(judge,ensure_ascii=False,allow_nan=False))
        if viewer_model:
            from .quality_judge import run_viewer
            # Get the exact same input inventory the final gate fingerprints.
            preliminary = report_for(post,directory,draft,history,judge,None,evidence,repo_root,now)
            viewer = run_viewer(directory,draft,evidence,preliminary['hashes'],viewer_model)
            (qa / 'viewer.json').write_text(json.dumps(viewer,ensure_ascii=False,allow_nan=False))
        report = report_for(post, directory, draft, history, judge, viewer, evidence, repo_root, now)
    except Exception as exc:  # model/measurement/storage errors must persist a FAIL report
        report = {'version': REPORT_VERSION, 'verdict': 'FAIL', 'post_id': post.get('id'),
                  'policy_digest': policy_digest(), 'errors': [{'code': 'evidence.invalid',
                  'detail': f'Missing/malformed Maker evidence ({type(exc).__name__})'}]}
    (qa / 'quality-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False, default=lambda x: x.isoformat())+'\n')
    return report
