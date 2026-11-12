from __future__ import annotations
import copy
import json
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from content_engine import quality_gate, quality_judge, validate, validate_copy, validate_media, validate_scripts
from content_engine.publisher import apply_action, publish_post
from content_engine.schedule import ScheduleError
from content_engine.stage import stage

NOW = datetime(2026,11,12,tzinfo=timezone.utc)


def good_draft():
    claim = validate_copy.catalogue()['features'][1]['claim']
    hook, cta = 'Remember the idea. Forget the account?', 'Try Skwirl. Link in bio.'
    return {'id':'q-good','kind':'reel','hook':hook,'caption':hook+'\n'+claim+' '+cta+'\n#Skwirl',
            'cta':cta,'feature_ids':['search'],'question':'Where is the saved tutorial?',
            'claims':[{'text':claim,'feature_id':'search'}], 'beats':[
             {'role':'hook','t_start':0,'t_end':3,'vo':hook,'on_screen':hook,'shot':'Seeded grid'},
             {'role':'re-hook','t_start':3,'t_end':5,'vo':'Try these words.','on_screen':'Try these words.','shot':'Search field'},
             {'role':'payoff','t_start':5,'t_end':9,'vo':claim,'on_screen':'Search by meaning.','shot':'Real matching note'},
             {'role':'cta','t_start':9,'t_end':12,'vo':cta,'on_screen':'Skwirl','shot':'Wordmark'}]}


def good_history():
    return [{'id':'old-1','path':'promo/CONTENT_HANDBOOK.md','text':'A calm brand launch for a new product', 'date':None,'status':'unknown'}]


def good_judge(draft, history, platforms):
    return {'model':'fixture-judge','reviewer':'editor-fixture',
            'input_digest':quality_judge.digest(quality_judge.judge_packet(draft,history,platforms)),
            'scores':{k:4 for k in quality_judge.DIMENSIONS},'reasons':{k:'Specific evidence in fixture' for k in quality_judge.DIMENSIONS},
            'claims_complete':True,'unsupported_claims':[],'issues':[],
            'claim_audit':[{'path':'beats.2.vo','text':draft['claims'][0]['text'],'feature_ids':['search'],'supported':True,'reason':'Source-backed search'}]}


def good_viewer(digest):
    return {'model':'fixture-viewer','reviewer':'viewer-fixture','input_digest':digest,
            'about_2s':'Finding a saved idea','about_10s':'Skwirl searches notes by meaning','issues':[],
            'checks':{k:True for k in quality_judge.VIEWER_CHECKS}}


def codes(errors):
    return {e['code'] for e in errors}


def test_good_copy_and_script():
    assert validate_copy.validate_copy(good_draft()) == []
    assert validate_scripts.validate_script(good_draft()) == []


@pytest.mark.parametrize('text,code',[
    ('A game-changer for your reels','style.slop'),('Skwirl — save it','style.em_dash'),
    ('Skwirl is open source','truth.licence'),('#opensource','truth.licence'),
    ('10,000 users love Skwirl','truth.number'),('Save 3 hours each week','truth.number'),
    ('Skwirl works instantly','truth.unsupported'),('Automatically search with ChatGPT','truth.automatic'),
    ('Claude Code is here. ChatGPT automatically finds all saves.','truth.automatic'),
    ('Jacinda from Australia says it is good','truth.testimonial_name'),
    ('Users say this is a miracle','truth.social_proof')])
def test_bad_copy(text,code):
    d=good_draft();d['beats'][1]['on_screen']=text
    assert code in codes(validate_copy.validate_copy(d))


def test_claim_coverage_cannot_be_omitted_or_relabelled():
    d=good_draft();d['claims']=[]
    assert 'truth.claims_missing' in codes(validate_copy.validate_copy(d))
    d=good_draft();d['claims'][0]['text']='Skwirl books holidays for you.'
    assert {'truth.claim','truth.claim_location'} <= codes(validate_copy.validate_copy(d))


def test_authorised_jacinda_exact_words_only():
    d=good_draft();q='It has revolutionised therapy planning for me.';a='Jacinda, occupational therapist'
    d['beats'][1]['on_screen']=q+' '+a
    d['testimonial']={'quote':q,'attribution':a}
    assert not any(e['code'].startswith('truth.testimonial') or e['code']=='style.slop' for e in validate_copy.validate_copy(d))
    d['testimonial']['quote']='It changed my life.'
    assert 'truth.testimonial_quote' in codes(validate_copy.validate_copy(d))


def test_automatic_only_exact_claude_code_copy():
    d=good_draft();d['beats'][1]['on_screen']=validate_copy.catalogue()['features'][-1]['claim']
    assert 'truth.automatic' not in codes(validate_copy.validate_copy(d))


def test_platform_and_reading_lints():
    d=good_draft();d['caption']+=' #a #b #c #d #e #f'
    assert 'style.hashtags' in codes(validate_copy.validate_copy(d))
    d['caption']='A'*2201
    assert {'platform.caption_length','style.bio','style.cta'} <= codes(validate_copy.validate_copy(d))
    d=good_draft();d['beats'][1]['vo']='Institutional interoperability operationalizes comprehensive contextualization and sophisticated personalization.'
    assert 'style.reading_grade' in codes(validate_copy.validate_copy(d))


def test_script_bad_timing_and_missing_bridge():
    d=good_draft();d['beats'][1]['t_start']=float('nan')
    assert validate_scripts.validate_script(d)
    d={'kind':'carousel','hook':'h','slides':[{'n':1,'job':'hook','text':'h','visual':'v'},{'n':2,'job':'cta','text':'c','visual':'v'}]}
    assert validate_scripts.validate_script(d)


def test_independent_judge_fail_closed():
    d,h=good_draft(),good_history();p={'instagram':{'caption':d['caption']}}
    packet=quality_judge.judge_packet(d,h,p);r=good_judge(d,h,p)
    assert quality_judge.validate_judge(r,packet)==[]
    for bad in (None,{},dict(r,scores={}),dict(r,claims_complete=False),dict(r,input_digest='stale'),dict(r,claim_audit=[])):
        assert quality_judge.validate_judge(bad,packet)
    for val in (True,3,6,float('nan')):
        bad=copy.deepcopy(r);bad['scores']['payoff']=val
        assert quality_judge.validate_judge(bad,packet)
    packet['draft']['caption']+=' changed'
    assert quality_judge.validate_judge(r,packet)


def test_viewer_not_inferred_from_editor():
    r=good_viewer('x')
    assert quality_judge.validate_viewer(r,'x')==[]
    r['checks']['captions_synced']=False
    assert quality_judge.validate_viewer(r,'x')
    assert quality_judge.validate_viewer(None,'x')


def test_captions_word_sync_boxes():
    row={'text':'hello','start':0.1,'end':0.5,'bbox':[100,250,300,60],'lines':1}
    c={'words':[row]};t={'words':[dict(row)]}
    assert validate_media.validate_captions(c,t,5)==[]
    c['words'][0]['start']=1
    assert validate_media.validate_captions(c,t,5)
    c['words'][0]=dict(row,start=.1,end=.5,bbox=[0,0,300,60],lines=3,text='false')
    assert validate_media.validate_captions(c,t,5)


def test_probe_failure_and_carousel_api_limit(tmp_path):
    (tmp_path/'bad.mp4').write_bytes(b'not video')
    errors,_=validate_media.validate_media({'kind':'reel','media':['bad.mp4']},tmp_path,{})
    assert {'media.measurement','media.safe_zones'} <= codes(errors)
    errors,_=validate_media.validate_media({'kind':'carousel','media':['missing.png']*11},tmp_path,{})
    assert 'media.api_limit' in codes(errors)


def test_media_measurements(tmp_path,monkeypatch):
    (tmp_path/'v.mp4').write_bytes(b'fixture')
    def info(_):return {'streams':[{'codec_type':'video','width':1080,'height':1920,'r_frame_rate':'30/1','codec_name':'h264'},
        {'codec_type':'audio','codec_name':'aac','sample_rate':'48000'}],'format':{'duration':'12'}}
    monkeypatch.setattr(validate_media,'probe',info)
    monkeypatch.setattr(validate_media,'measure_loudness',lambda _:{'integrated_lufs':-14.,'true_peak_dbtp':-1.2})
    row={'text':'hello','start':0.1,'end':.5,'bbox':[100,250,300,60],'lines':1}
    ev={'captions':{'burned_in':True,'words':[row]},'transcript':{'words':[dict(row)]},'key_text_boxes':[{'bbox':[100,300,800,200]}]}
    p={'kind':'reel','media':['v.mp4']}
    assert validate_media.validate_media(p,tmp_path,ev)[0]==[]
    monkeypatch.setattr(validate_media,'measure_loudness',lambda _:{'integrated_lufs':-24.,'true_peak_dbtp':0.2})
    assert {'media.loudness','media.peak'} <= codes(validate_media.validate_media(p,tmp_path,ev)[0])
    orig=info(None);orig['streams'][0]['width']=1920;orig['format']['duration']='61'
    monkeypatch.setattr(validate_media,'probe',lambda _:orig)
    assert {'media.resolution','media.duration'} <= codes(validate_media.validate_media(p,tmp_path,ev)[0])


def test_report_missing_evidence_blocks(tmp_path):
    r=validate.validate_post({'id':'x','kind':'reel','media':[]},tmp_path,good_history())
    assert r['verdict']=='FAIL' and (tmp_path/'qa/quality-report.json').exists()


def test_real_gate_no_telegram_or_uploads_on_failure(make_ctx,week_dir,fake):
    from content_engine.schedule import init_schedule
    sched=init_schedule(week_dir,'2026-11-17');(week_dir/'schedule.json').write_text(json.dumps(sched))
    ctx=make_ctx()
    with pytest.raises(ScheduleError,match='Quality gate'):
        stage(ctx,week_dir)
    assert fake.sent==[] and ctx.store.list('posts/')==[] and ctx.store.list('media/')==[]


def test_legacy_and_auto_approved_cannot_bypass_gate(make_ctx):
    ctx=make_ctx();p={'id':'legacy','status':'awaiting_approval'}
    assert 'blocked approval' in apply_action(ctx,p,'ap')
    p['status']='approved'
    with pytest.raises(ScheduleError):publish_post(ctx,p,[])


def test_record_binding_and_uploaded_asset_tampering(make_ctx,tmp_path):
    ctx=make_ctx();p={'id':'q-good','kind':'reel','instagram':{'caption':'reviewed'},'media_keys':['media/test.mp4']}
    src=tmp_path/'test.mp4';src.write_bytes(b'reviewed')
    ctx.store.put_file('media/test.mp4',src)
    import hashlib
    p['quality_asset_hashes']={'media/test.mp4':hashlib.sha256(b'reviewed').hexdigest()}
    (tmp_path/'qa').mkdir()
    r={'version':1,'post_id':p['id'],'verdict':'PASS','errors':[],'policy_digest':validate.policy_digest()}
    quality_gate.bind_report(ctx,p,r,tmp_path)
    assert quality_gate.record_problems(ctx,p)==[]
    p['instagram']['caption']='changed'
    assert quality_gate.record_problems(ctx,p)
    p['instagram']['caption']='reviewed';src.write_bytes(b'changed');ctx.store.put_file('media/test.mp4',src)
    assert quality_gate.record_problems(ctx,p,verify_media=True)


def test_old_vs_recent_duplicates_timezone_aware():
    from content_engine.ideation import find_duplicates
    h=good_history();h[0].update(text='Keep context in a written note',date=datetime(2026,8,1))
    assert find_duplicates(h[0]['text'],h,weeks=6,now=NOW)[0]['blocking'] is False
    h[0]['date']=None
    assert find_duplicates(h[0]['text'],h,weeks=6,now=NOW)[0]['blocking'] is True


def test_json_copy_fixtures():
    fixtures=Path(__file__).parent/'fixtures/quality'
    assert not validate_copy.validate_copy(json.loads((fixtures/'good-copy.json').read_text()))
    assert {'truth.licence','truth.claim','truth.feature','style.em_dash','truth.automatic'} <= codes(
        validate_copy.validate_copy(json.loads((fixtures/'bad-copy.json').read_text())))


def test_mining_uses_cohorts_and_no_missing_metric_invention():
    from content_engine.format_mining import shortlist, analyse_formats
    posts=[{'id':str(i),'url':'https://example.com/'+str(i),'creator':'a','kind':'reel','age_days':3,
            'views':v,'permitted_source':'manual','hook':'A unique original creator hook'} for i,v in enumerate((100,120,600))]
    rows=shortlist(posts)
    assert rows[0]['relative_views']==5 and rows[0]['rates']=={} and rows[0]['cohort_n']==3
    assert shortlist(posts[:2])==[]
    assert shortlist([dict(p,permitted_source='unapproved_scrape') for p in posts])==[]
    with pytest.raises(ValueError):analyse_formats(posts,lambda _: '[{"source_ids":["made-up"],"confidence":"proven"}]')


def test_nan_input_replaces_stale_report_with_fail(tmp_path):
    (tmp_path/'qa').mkdir();(tmp_path/'qa/quality-report.json').write_text('{"verdict":"PASS"}')
    (tmp_path/'content.json').write_text('{"x":NaN}')
    r=validate.validate_post({'id':'x'},tmp_path,good_history())
    assert r['verdict']=='FAIL' and json.loads((tmp_path/'qa/quality-report.json').read_text())['verdict']=='FAIL'


def test_snapshot_rejects_source_mutation(tmp_path):
    import hashlib
    (tmp_path/'media.mp4').write_bytes(b'before')
    r={'hashes':{'media.mp4':hashlib.sha256(b'before').hexdigest()}}
    frozen=quality_gate.freeze_sources(tmp_path,r,tmp_path/'frozen')
    assert (frozen/'media.mp4').read_bytes()==b'before'
    (tmp_path/'media.mp4').write_bytes(b'after')
    with pytest.raises(ScheduleError):quality_gate.freeze_sources(tmp_path,r,tmp_path/'frozen2')


def test_auto_approval_does_not_approve_legacy(make_ctx):
    from content_engine.publisher import tick
    ctx=make_ctx(auto_approve=True)
    p={'id':'old-q','when':'2030-01-01','status':'awaiting_approval','kind':'reel','results':{}}
    ctx.store.put_json('posts/old-q.json',p);tick(ctx)
    assert ctx.store.get_json('posts/old-q.json')['status']=='awaiting_approval'


def test_full_good_carousel_report_and_mutation(tmp_path):
    from PIL import Image
    d=good_draft();d['kind']='carousel';d.pop('beats')
    claim=d['claims'][0]['text']
    d['slides']=[{'n':1,'job':'hook','text':d['hook'],'bridge':'Try plain words.','visual':'Demo starting point'},
                 {'n':2,'job':'payoff','text':claim,'bridge':'Ready to try?','visual':'Real result'},
                 {'n':3,'job':'cta','text':d['cta'],'bridge':'','visual':'Wordmark'}]
    for n in range(1,4):Image.new('RGB',(1080,1350),'white').save(tmp_path/f'{n:02}.png')
    copy={'slides':[{'title':s['text'],'bridge':s['bridge']} for s in d['slides']]}
    (tmp_path/'copy.json').write_text(json.dumps(copy))
    (tmp_path/'qa').mkdir();(tmp_path/'qa/sheet.png').write_bytes((tmp_path/'01.png').read_bytes())
    p={'id':d['id'],'kind':'carousel','media':['01.png','02.png','03.png'],'instagram':{'caption':d['caption']}}
    evidence={'viewer_files':['qa/sheet.png'],'key_text_boxes':[{'bbox':[100,100,800,500]}]}
    history=good_history();judge=good_judge(d,history,{'instagram':p['instagram']})
    judge['claim_audit'][0]['path']='slides.1.text'
    provisional=validate.report_for(p,tmp_path,d,history,judge,None,evidence)
    viewer=good_viewer(provisional['viewer_input_digest'])
    report=validate.report_for(p,tmp_path,d,history,judge,viewer,evidence)
    assert report['verdict']=='PASS',report['errors']
    (tmp_path/'01.png').write_bytes(b'broken after review')
    report=validate.report_for(p,tmp_path,d,history,judge,viewer,evidence)
    assert report['verdict']=='FAIL' and 'quality.viewer' in codes(report['errors'])


def test_heading_idea_exclusion_keeps_other_history(tmp_path):
    from content_engine.ideation import read_history
    (tmp_path/'promo/engine').mkdir(parents=True)
    (tmp_path/'promo/engine/ideas.md').write_text('### quality-01\nThe drill is out. Where are the instructions?\n### quality-02\nA different rainy day story.\n')
    history=read_history(tmp_path,exclude_ids=['quality-01'])
    assert history and {h['id'] for h in history}=={'quality-02'}
