from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

from content_engine import dashboard, publisher
from content_engine.quality_gate import record_digest
from content_engine.store import LocalStore
from content_engine.config import Config


def post(ctx, **values):
    record = {'id':'review-01','kind':'static','when':'2026-11-17 22:30','tz':'Asia/Kolkata',
              'status':'awaiting_approval','instagram':{'caption':'A local draft'},'media_keys':['media/week/review-01/01.jpg']}
    record.update(values)
    publisher.save(ctx.store, record)
    return record


def command(ctx, record, action='approve', hash=None):
    ctx.store.put_json('commands/pending/one.json', {'id':record['id'],'action':action,'hash':hash or record_digest(record)})


def test_console_approval_missing_gate_is_rejected(make_ctx):
    ctx=make_ctx(ig=False,yt=False,tg=False)
    record=post(ctx)
    command(ctx,record)
    dashboard.apply_commands(ctx)
    assert ctx.store.get_json('posts/review-01.json')['status']=='awaiting_approval'
    assert 'Quality gate blocked' in ctx.store.get_json('commands/results/one.json')['message']
    assert not ctx.store.list('commands/pending/')


def test_console_stale_hash_cannot_skip_changed_draft(make_ctx):
    ctx=make_ctx(ig=False,yt=False,tg=False)
    record=post(ctx)
    command(ctx,record,'skip')
    record['instagram']['caption']='Changed since review'
    publisher.save(ctx.store,record)
    dashboard.apply_commands(ctx)
    assert ctx.store.get_json('posts/review-01.json')['status']=='awaiting_approval'
    assert 'changed' in ctx.store.get_json('commands/results/one.json')['message']


def test_console_skip_uses_telegram_transition_and_receipt_is_idempotent(make_ctx):
    ctx=make_ctx(ig=False,yt=False,tg=False)
    record=post(ctx)
    command(ctx,record,'skip')
    dashboard.apply_commands(ctx)
    assert ctx.store.get_json('posts/review-01.json')['status']=='skipped'
    command(ctx,record,'approve')
    dashboard.apply_commands(ctx)
    assert ctx.store.get_json('posts/review-01.json')['status']=='skipped'
    assert 'Skipped' in ctx.store.get_json('commands/results/one.json')['message']


def test_console_summary_has_hash_dates_metrics_and_no_credentials(make_ctx):
    ctx=make_ctx(ig=False,yt=False,tg=False)
    record=post(ctx,status='done',results={'instagram':{'published_at':'2026-11-17T17:00:00+00:00','state':'published','metrics':{'h48':{'views':20}}}})
    value=dashboard.export(ctx)
    assert len(value['ideas'])==5
    assert value['posted'][0]['content_hash']==record_digest(record)
    assert value['posted'][0]['metrics']['48h']['instagram']['views']==20
    assert value['posted'][0]['metrics']['7d']['instagram'] is None
    assert ctx.cfg.ig_token not in json.dumps(value)
    assert ctx.store.get_json('dashboard/summary.json')==value


def test_console_dry_run_lock_survives_telegram_resume(make_ctx):
    ctx=make_ctx(ig=False,yt=False,tg=False)
    ctx.store.put_json('state/paused.json',{'paused':True,'dry_run':True})
    publisher.tick(ctx)
    assert ctx.cfg.dry_run is True
    assert ctx.store.get_json('state/paused.json')['dry_run'] is True


def load_bin(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).resolve().parents[1]/'bin'/f'{name}.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize('job',['tick','insights','queue','research','make','pause','resume'])
def test_disabled_workflow_never_constructs_store_or_clients(monkeypatch,tmp_path,job):
    monkeypatch.delenv('ENGINE_ENABLED',raising=False)
    monkeypatch.setenv('ENGINE_LOCAL_STORE',str(tmp_path/'must-not-exist'))
    from content_engine import cli
    monkeypatch.setattr(cli,'build',lambda *a,**kw: pytest.fail('disabled workflow constructed clients'))
    assert load_bin('workflow').main([job])==0
    assert not (tmp_path/'must-not-exist').exists()


def test_safe_workflow_make_queues_work_and_locks_dry_run(monkeypatch,tmp_path):
    monkeypatch.setenv('ENGINE_ENABLED','1')
    monkeypatch.setenv('ENGINE_LOCAL_STORE',str(tmp_path))
    for key in ('IG_ACCESS_TOKEN','IG_USER_ID','YT_CLIENT_ID','TG_ENGINE_BOT_TOKEN'):
        monkeypatch.delenv(key,raising=False)
    assert load_bin('workflow').main(['make'])==0
    store=LocalStore(tmp_path)
    assert store.get_json('state/paused.json')['dry_run'] is True
    jobs=store.list('state/jobs/pending/')
    assert len(jobs)==1 and store.get_json(jobs[0])['command']=='make'


def test_mac_picks_up_dispatched_job_once(monkeypatch,tmp_path):
    monkeypatch.setenv('ENGINE_ENABLED','1');monkeypatch.setenv('ENGINE_LOCAL_STORE',str(tmp_path/'store'))
    weekly=load_bin('weekly');monkeypatch.setattr(weekly,'OUTPUT',tmp_path/'out')
    store=LocalStore(tmp_path/'store');store.put_json('state/jobs/pending/request.json',{'command':'research','dry_run':True})
    calls=[]
    monkeypatch.setitem(sys.modules,'crew',SimpleNamespace(start=lambda *a,**kw:calls.append((a,kw)) or {'id':'task-1'}))
    monkeypatch.setattr(sys,'argv',['weekly.py','auto'])
    assert weekly.main()==0 and len(calls)==1
    assert not store.list('state/jobs/pending/')
    assert store.get_json('state/jobs/started/request.json')['task_id']=='task-1'
