"""Mandatory stage/approve/publish barriers, separate from Maker-owned files."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .quality_judge import digest
from .validate import REPORT_VERSION, hashes, policy_digest, validate_post

BINDING_FIELDS = ('id', 'kind', 'when', 'tz', 'instagram', 'youtube', 'media_keys', 'cover_key', 'quality_asset_hashes', 'quality_source_hashes')


def record_digest(record: dict) -> str:
    return digest({k: record.get(k) for k in BINDING_FIELDS})


def stage_reports(schedule: dict, week_dir: Path, now=None) -> dict:
    """Validate the entire batch BEFORE any uploads, records or Telegram messages."""
    from .ideation import read_history
    from .schedule import ScheduleError
    root = Path(__file__).resolve().parents[3]
    # Read canonical main checkout outputs as well as this isolated worktree, if present.
    history = read_history(root)
    marker = '/.crew/wt/'
    if marker in str(root):
        main = Path(str(root).split(marker)[0])
        history += read_history(main)
    from .quality_flow import cli_model, parse_model_json
    editor = cli_model('sonnet')
    viewer = cli_model('sonnet', viewer=True)
    def editor_json(prompt):
        result = parse_model_json(editor(prompt))
        result['transport'] = editor.last_provenance
        return result
    reports = {}
    for post in schedule['posts']:
        directory = week_dir / post.get('dir', '')
        if not directory.resolve().is_relative_to(week_dir.resolve()) or directory.resolve() == week_dir.resolve():
            raise ScheduleError('Quality gate: unsafe post directory')
        # Exclude exactly this artifact, never the rest of the week or older ideas.
        own = str(directory.resolve())
        filtered = [h for h in history if h['id'] != post.get('idea_id') and str((root / h['path'].split('#')[0]).resolve()) != own
                    and not str((root / h['path'].split('#')[0]).resolve()).startswith(own + '/')]
        # Reviews are rerun at the boundary; Maker-authored PASS JSON cannot approve itself.
        report = validate_post(post, directory, filtered, root, now, judge_model=editor_json, viewer_model=viewer)
        reports[post['id']] = report
    failures = [f"{pid}: " + ', '.join(e['code'] for e in r['errors']) for pid, r in reports.items() if r['verdict'] != 'PASS']
    if failures:
        raise ScheduleError('Quality gate blocked batch (see each qa/quality-report.json):\n' + '\n'.join(failures))
    return reports


def bind_report(ctx, record: dict, report: dict, directory: Path) -> None:
    """Bind PASS to actual converted uploads, not just pre-conversion source names."""
    if report.get('verdict') != 'PASS':
        raise ValueError('Cannot bind a failing quality report')
    report = dict(report)
    report['record_digest'] = record_digest(record)
    report['report_digest'] = digest({k: v for k, v in report.items() if k != 'report_digest'})
    key = f"quality/{record['id']}.json"
    ctx.store.put_json(key, report)
    record['quality_report_key'] = key
    record['quality_report_digest'] = report['report_digest']
    (directory / 'qa/quality-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False, default=_json_date, allow_nan=False)+'\n')


def _json_date(value):
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    raise TypeError(type(value).__name__)


def record_problems(ctx, record: dict, verify_media: bool = False) -> list[str]:
    """Fail closed for legacy/mutated/failed records, including manual/auto approvals."""
    key = record.get('quality_report_key')
    if not key:
        return ['missing mandatory quality report; restage after Maker evidence exists']
    try:
        report = ctx.store.get_json(key)
        if not report or report.get('version') != REPORT_VERSION or report.get('verdict') != 'PASS' or report.get('errors') != []:
            return ['quality report missing, malformed or failed']
        actual = digest({k: v for k, v in report.items() if k != 'report_digest'})
        if actual != report.get('report_digest') or actual != record.get('quality_report_digest'):
            return ['quality report changed after staging']
        if report.get('policy_digest') != policy_digest():
            return ['quality policy changed; regenerate evidence and restage']
        if report.get('record_digest') != record_digest(record):
            return ['scheduled copy, media or timing changed after review; restage']
        if report.get('post_id') != record.get('id'):
            return ['quality report belongs to another post']
        asset_hashes = record.get('quality_asset_hashes', {})
        expected = record.get('media_keys', []) + ([record['cover_key']] if record.get('cover_key') else [])
        if not expected or set(asset_hashes) != set(expected):
            return ['uploaded media hash coverage is incomplete']
        for name, expected_hash in (asset_hashes.items() if verify_media else []):
            if hashlib.sha256(ctx.store.get_bytes(name)).hexdigest() != expected_hash:
                return ['uploaded media changed after review']
        return []
    except Exception:  # storage/network failures also fail closed, never consume approval silently
        return ['quality report unreadable']


def require_record(ctx, record: dict) -> None:
    errors = record_problems(ctx, record, verify_media=True)
    if errors:
        from .schedule import ScheduleError
        raise ScheduleError('Quality gate: ' + '; '.join(errors))


def freeze_sources(directory: Path, report: dict, target: Path) -> Path:
    """Validate and copy each reviewed file once, sealing uploads against concurrent re-renders."""
    from .schedule import ScheduleError
    target.mkdir(parents=True, exist_ok=True)
    for name, expected in report.get('hashes', {}).items():
        src = directory / name
        if not src.resolve().is_relative_to(directory.resolve()):
            raise ScheduleError('Quality gate: evidence path escapes post directory')
        data = src.read_bytes()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ScheduleError('Quality gate: source changed since validation: ' + name)
        dst = target / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
    (target / 'qa').mkdir(exist_ok=True)
    return target
