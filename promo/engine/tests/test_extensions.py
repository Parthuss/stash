from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from datetime import timedelta

import httpx
import pytest

from content_engine import publisher, schedule, stage, stills
from content_engine.http import ApiError, Http
from content_engine.youtube import YouTube
from content_engine.store import R2Store
from test_engine import staged, post


def test_static_posts_publish_one_image_and_no_youtube(make_ctx, week_dir, fake, clock):
    car = week_dir / '03-export-carousel'
    (car / '02.png').unlink()
    (car / '03.png').unlink()
    ctx, sched = staged(make_ctx, week_dir)
    item = sched['posts'][1]
    assert item['kind'] == 'static' and 'youtube' not in item
    assert schedule.validate(sched, week_dir) == []
    publisher.apply_action(ctx, post(ctx, item['id']), 'ap')
    clock.set('2026-11-19T22:40:00+05:30')
    publisher.tick(ctx)
    created = [c for m,u,c in fake.calls if m == 'POST' and u.endswith('/media')]
    assert len(created) == 1
    assert created[0]['image_url'].endswith('.jpg')
    assert 'is_carousel_item' not in created[0]
    assert post(ctx, item['id'])['status'] == 'done'


def test_staging_is_immutable_even_before_approval(make_ctx, week_dir):
    ctx, sched = staged(make_ctx, week_dir)
    pid = sched['posts'][0]['id']
    original = post(ctx, pid)
    sched['posts'][0]['instagram']['caption'] = 'Changed after review'
    (week_dir / 'schedule.json').write_text(json.dumps(sched))
    stage.stage(ctx, week_dir, restage=True)
    assert post(ctx, pid) == original


def test_remote_staging_cannot_bypass_qa(make_ctx, week_dir):
    ctx = make_ctx()
    with pytest.raises(schedule.ScheduleError, match='local mock runs'):
        stage.stage(ctx, week_dir, require_qa=False)


def test_schedule_rejects_escaped_media_and_unknown_timezone(week_dir):
    sched = schedule.init_schedule(week_dir, '2026-11-17')
    sched['posts'][0]['media'] = ['../../secret.mp4']
    sched['tz'] = 'Not/AZone'
    errors = schedule.validate(sched, week_dir)
    assert any('escapes' in e for e in errors)
    assert any('timezone' in e for e in errors)


def test_rendered_stills_cannot_change_after_qa(week_dir):
    sched = schedule.init_schedule(week_dir, '2026-11-17')
    d = week_dir / sched['posts'][1]['dir']
    (d / 'copy.json').write_text(json.dumps({'slides': [{'title': 'A useful note'}]}))
    names = sched['posts'][1]['media'] + ['caption.txt','copy.json']
    hashes = {n: hashlib.sha256((d/n).read_bytes()).hexdigest() for n in names}
    (d / 'qa/checks.json').write_text(json.dumps({'mechanical':'PASS','hashes':hashes}))
    assert schedule.validate(sched, week_dir) == []
    (d / '01.png').write_bytes(b'changed')
    assert any('changed after render QA' in e for e in schedule.validate(sched, week_dir))


def _carousel(tmp_path, **over):
    """A minimal script that meets the carousel standard; tests then break one rule at a time."""
    for name in ('a.png', 'b.png', 'c.png'):
        (tmp_path / name).write_bytes(b'x')
    data = {'kind': 'carousel', 'caption': 'A note. Link in bio.',
            'assets': {'a': {'type': 'ui', 'file': 'a.png', 'source': 'demo capture'},
                       'b': {'type': 'ui', 'file': 'b.png', 'source': 'demo capture'},
                       'c': {'type': 'thumb', 'file': 'c.png', 'source': 'covers'}},
            'slides': [
                {'layout': 'hook', 'bg': 'lilac', 'title': 'Hook', 'bridge': 'why', 'tiles': [{'asset': 'c'}, {'gone': True}]},
                {'layout': 'phone', 'bg': 'lavender', 'title': 'Phone', 'bridge': 'why', 'screen': 'a', 'tile': 'c'},
                {'layout': 'zoom', 'bg': 'mint', 'title': 'Zoom', 'bridge': 'why', 'crops': [{'asset': 'b', 'crop': [0, 0, 100, 50]}]},
                {'layout': 'cta', 'bg': 'lavender', 'title': 'Try it', 'bridge': 'Link in bio'}]}
    data.update(over)
    script = tmp_path / 'post.json'
    script.write_text(json.dumps(data))
    return script, data


def test_stills_require_visuals_and_check_all_copy(tmp_path):
    script = tmp_path / 'post.json'
    script.write_text(json.dumps({'kind':'static','slides':[{'layout':'promise','title':'Useful','bridge':'Try it'}]}))
    with pytest.raises(ValueError, match='no visuals'):
        stills.read_script(script)
    script, data = _carousel(tmp_path)
    assert stills.read_script(script)['slides'][0]['layout'] == 'hook'
    data['slides'][2]['body'] = 'Unlimited saves'
    script.write_text(json.dumps(data))
    with pytest.raises(ValueError, match='unlimited'):
        stills.read_script(script)
    data['slides'][2]['body'] = 'A note'
    data['assets']['a']['file'] = 'missing.png'
    script.write_text(json.dumps(data))
    with pytest.raises(ValueError, match='missing asset'):
        stills.build(script, tmp_path / 'out')


def test_carousel_standard_is_enforced(tmp_path):
    script, data = _carousel(tmp_path)
    data['slides'][2]['crops'] = [{'asset': 'a', 'crop': [0, 0, 390, 844]}]
    data['slides'][1]['screen'] = 'a'
    data['slides'][2] = {'layout': 'phone', 'bg': 'mint', 'title': 'Again', 'bridge': 'why', 'screen': 'a'}
    script.write_text(json.dumps(data))
    with pytest.raises(ValueError) as e:
        stills.read_script(script)
    assert 'repeats slide 2' in str(e.value) and 'same layout' in str(e.value)
    script, data = _carousel(tmp_path)
    data['assets']['a']['source'] = 'mockup'
    data['slides'][3]['layout'] = 'promise'
    data['slides'][0]['title'] = 'one two three four five six seven eight nine ten eleven'
    script.write_text(json.dumps(data))
    with pytest.raises(ValueError) as e:
        stills.read_script(script)
    msg = str(e.value)
    assert 'real captures' in msg and 'cta layout' in msg and 'hook' in msg
    script, data = _carousel(tmp_path)
    data['assets'] = {k: v for k, v in data['assets'].items() if k == 'c'}
    data['slides'][1] = {'layout': 'statement', 'bg': 'peach', 'title': 'S', 'bridge': 'why', 'asset': 'c'}
    data['slides'][2] = {'layout': 'promise', 'bg': 'ink', 'title': 'P', 'bridge': 'why'}
    script.write_text(json.dumps(data))
    with pytest.raises(ValueError, match='real product'):
        stills.read_script(script)


def test_weekly_runner_research_codex_make_claude_and_overrides(tmp_path, monkeypatch):
    monkeypatch.setenv("ENGINE_ENABLED", "1")
    source = Path(__file__).resolve().parents[1] / 'bin/weekly.py'
    spec = importlib.util.spec_from_file_location('weekly', source)
    weekly = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(weekly)
    monkeypatch.setattr(weekly, 'OUTPUT', tmp_path)
    for v in ('ENGINE_AGENT', 'ENGINE_RESEARCH_AGENT', 'ENGINE_MAKE_AGENT', 'ENGINE_EFFORT', 'ENGINE_MAKE_EFFORT'):
        monkeypatch.delenv(v, raising=False)
    called = []
    monkeypatch.setitem(sys.modules,'crew',SimpleNamespace(start=lambda *a,**k: called.append((a,k)) or {'id':'fake'}))
    monkeypatch.setattr(sys, 'argv', ['weekly.py','research'])
    assert weekly.main() == 0 and called[-1][0][0] == 'codex' and called[-1][1]['effort'] == 'xhigh'
    assert weekly.main() == 0 and len(called) == 1          # one task per job per day
    monkeypatch.setattr(sys, 'argv', ['weekly.py','make'])
    assert weekly.main() == 0 and called[-1][0][0] == 'claude-craveto' and called[-1][1]['effort'] == 'max'
    for marker in tmp_path.glob('.started-*'):
        marker.unlink()
    monkeypatch.setenv('ENGINE_AGENT', 'codex')             # fallback for both
    monkeypatch.setenv('ENGINE_MAKE_AGENT', 'claude-main')  # job-specific wins
    assert weekly.main() == 0 and called[-1][0][0] == 'claude-main'
    monkeypatch.setattr(sys, 'argv', ['weekly.py','research'])
    assert weekly.main() == 0 and called[-1][0][0] == 'codex'


def test_youtube_session_saved_before_bytes_then_resumed_without_second_insert():
    calls = []
    sessions = []
    fail = [True]
    def handler(req):
        calls.append((req.method, str(req.url), dict(req.headers), req.content))
        if req.url.host == 'oauth2.googleapis.com':
            return httpx.Response(200,json={'access_token':'token'})
        if req.method == 'POST':
            return httpx.Response(200,headers={'location':'https://upload.test/session'})
        if req.headers.get('content-range') == 'bytes */10':
            return httpx.Response(308,headers={'range':'bytes=0-3'})
        assert sessions == ['https://upload.test/session']
        if fail.pop() if fail else False:
            return httpx.Response(503,json={'error':{'message':'network'}})
        assert req.headers['content-range'] == 'bytes 4-9/10'
        assert req.content == b'456789'
        return httpx.Response(201,json={'id':'video1','status':{'privacyStatus':'public'}})
    client = httpx.Client(transport=httpx.MockTransport(handler))
    yt = YouTube('client','secret','refresh',Http('yt',[],client))
    with pytest.raises(ApiError):
        yt.upload(b'0123456789','title','desc',[],on_session=sessions.append)
    assert yt.upload(b'0123456789','title','desc',[],session=sessions[0]) == ('video1','public')
    assert len([c for c in calls if c[0] == 'POST' and 'upload/youtube' in c[1]]) == 1


def test_completed_youtube_session_recovers_lost_success_without_new_upload():
    def handler(req):
        if req.url.host == 'oauth2.googleapis.com':
            return httpx.Response(200,json={'access_token':'token'})
        assert req.method == 'PUT' and req.content == b''
        return httpx.Response(200,json={'id':'already-uploaded','status':{'privacyStatus':'public'}})
    yt = YouTube('client','secret','refresh',Http('yt',[],httpx.Client(transport=httpx.MockTransport(handler))))
    assert yt.upload(b'video','title','desc',[],session='https://upload.test/session')[0] == 'already-uploaded'


def test_rate_limit_retry_after_blocks_early_scheduler_retry(make_ctx, week_dir, fake, clock):
    ctx, sched = staged(make_ctx, week_dir)
    ctx.yt = None
    pid = sched['posts'][0]['id']
    publisher.apply_action(ctx, post(ctx, pid), 'ap')
    clock.set('2026-11-17T22:31:00+05:30')
    calls = []
    def quota():
        calls.append(1)
        raise ApiError('instagram',429,'slow down',True,retry_after=3600)
    ctx.ig.publishing_quota = quota
    publisher.tick(ctx)
    clock.t += timedelta(minutes=15)
    publisher.tick(ctx)
    assert len(calls) == 1
    clock.t += timedelta(minutes=46)
    publisher.tick(ctx)
    assert len(calls) == 2


def test_http_parses_retry_after_header():
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(429,headers={'Retry-After':'120'},json={'error':'slow'})))
    with pytest.raises(ApiError) as err:
        Http('test',[],client).request('GET','https://api.test')
    assert err.value.retry_after == 120 and err.value.retryable


def test_r2_refuses_public_base_for_bucket_containing_tokens():
    with pytest.raises(ValueError,match='private state'):
        R2Store('account','access','secret','bucket',public_base='https://public.example')


def test_actions_auto_approve_flag_applies_waiting_items_but_preserves_skips(make_ctx, week_dir):
    ctx, sched = staged(make_ctx, week_dir)
    publisher.apply_action(ctx, post(ctx,sched['posts'][1]['id']),'sk')
    ctx.cfg.auto_approve = True
    publisher.tick(ctx)
    assert post(ctx,sched['posts'][0]['id'])['status'] == 'approved'
    assert post(ctx,sched['posts'][1]['id'])['status'] == 'skipped'


def test_connect_env_round_trips_shell_metacharacters_without_execution(tmp_path, monkeypatch):
    spec = importlib.util.spec_from_file_location('connect',Path(__file__).resolve().parents[1]/'bin/connect.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module,'ENV',tmp_path/'env')
    value = "synthetic'quote $literal `literal`"
    module.write_env(TEST=value)
    assert module.read_env()['TEST'] == value
    assert module.ENV.stat().st_mode & 0o777 == 0o600


# Base-branch cases retained with the Maker's assets schema (the legacy art map was replaced).
def test_stills_require_art_and_check_all_copy(tmp_path):
    script = tmp_path / 'post.json'
    script.write_text(json.dumps({'kind':'static','slides':[{'layout':'promise','title':'Useful','bridge':'Try it'}]}))
    with pytest.raises(ValueError, match='artwork'):
        stills.read_script(script)
    data = {'kind':'static','assets':{'one':{'type':'art','file':'one.png','prompt':'NO TEXT'}},
            'slides':[{'layout':'promise','title':'Useful','bridge':'Try it','card':'Unlimited saves'}]}
    script.write_text(json.dumps(data))
    with pytest.raises(ValueError, match='unlimited'):
        stills.read_script(script)
    data['slides'][0]['card'] = 'A note'
    script.write_text(json.dumps(data))
    with pytest.raises(ValueError, match='missing asset'):
        stills.build(script, tmp_path / 'out')


def test_weekly_runner_defaults_codex_and_accepts_override(tmp_path, monkeypatch):
    monkeypatch.setenv('ENGINE_ENABLED','1')
    source = Path(__file__).resolve().parents[1] / 'bin/weekly.py'
    spec = importlib.util.spec_from_file_location('weekly_base_cases', source)
    weekly = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(weekly)
    monkeypatch.setattr(weekly, 'OUTPUT', tmp_path)
    monkeypatch.setattr(sys, 'argv', ['weekly.py','research'])
    for variable in ('ENGINE_AGENT','ENGINE_RESEARCH_AGENT','ENGINE_LOCAL_STORE','R2_BUCKET'):
        monkeypatch.delenv(variable, raising=False)
    called = []
    monkeypatch.setitem(sys.modules,'crew',SimpleNamespace(start=lambda *a,**k: called.append((a,k)) or {'id':'fake'}))
    assert weekly.main() == 0 and called[-1][0][0] == 'codex'
    assert weekly.main() == 0 and len(called) == 1
    for marker in tmp_path.glob('.started-*'):
        marker.unlink()
    monkeypatch.setenv('ENGINE_AGENT','claude-craveto')
    assert weekly.main() == 0 and called[-1][0][0] == 'claude-craveto'
