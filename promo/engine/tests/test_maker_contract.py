"""Actual local Maker output reaches the mandatory gate; fixture reviews are not approval."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest
from PIL import Image

from content_engine import quality_judge, stills, validate, validate_copy, validate_scripts

ENGINE = Path(__file__).resolve().parents[1]


def static_script(tmp_path):
    Image.new('RGB', (100, 100), 'white').save(tmp_path / 'asset.png')
    claim = next(f['claim'] for f in validate_copy.catalogue()['features'] if f['id'] == 'search')
    hook, cta = 'Where was that saved idea?', 'Try Skwirl. Link in bio.'
    data = {'id': 'maker-static', 'kind': 'static', 'hook': hook,
            'audience': 'People looking for a saved idea', 'question': hook,
            'feature_ids': ['search'], 'claims': [{'text': claim, 'feature_id': 'search'}],
            'cta': cta, 'caption': claim + '\n' + cta + '\n#Skwirl',
            'assets': {'ui': {'type': 'ui', 'file': 'asset.png', 'source': 'test demo capture'}},
            'slides': [{'layout': 'cta', 'title': hook, 'body': claim, 'pill': cta, 'bridge': cta}]}
    script = tmp_path / 'post.json'
    script.write_text(json.dumps(data))
    return script


def test_actual_still_render_to_quality_gate(tmp_path):
    module = os.environ.get('PLAYWRIGHT_MODULE', '/tmp/pwshots/node_modules/playwright-core')
    chrome = Path(os.environ.get('CHROME_PATH', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'))
    if not Path(module).exists() or not chrome.exists() or not shutil.which('ffprobe'):
        pytest.skip('Local Chrome/Playwright/ffprobe required for actual render integration')
    out = tmp_path / 'rendered'
    stills.build(static_script(tmp_path), out)
    subprocess.run(['node', str(ENGINE / 'bin/render-stills.cjs'), str(out)], check=True,
                   env={**os.environ, 'PLAYWRIGHT_MODULE': module, 'CHROME_PATH': str(chrome)}, capture_output=True)
    draft = json.loads((out / 'content.json').read_text())
    evidence = json.loads((out / 'qa/evidence.json').read_text())
    assert evidence['viewer_files'] == ['01.png', 'cover.png']
    assert evidence['key_text_boxes'] and all(b['slide'] == 1 for b in evidence['key_text_boxes'])
    assert validate_scripts.validate_script(draft) == []
    post = {'id': draft['id'], 'kind': 'static', 'media': ['01.png'], 'cover': 'cover.png',
            'instagram': {'caption': draft['caption']}}
    history = [{'id': 'old', 'path': 'fixture', 'text': 'A calm brand launch for a new product', 'status': 'unknown', 'date': None}]
    packet = quality_judge.judge_packet(draft, history, {'instagram': post['instagram']})
    judge = {'model': 'test-fixture', 'reviewer': 'fixture-editor', 'input_digest': quality_judge.digest(packet),
             'scores': {d: 4 for d in quality_judge.DIMENSIONS},
             'reasons': {d: 'Fixture assertion only' for d in quality_judge.DIMENSIONS},
             'claims_complete': True, 'unsupported_claims': [], 'issues': [],
             'claim_audit': [{'path': 'slides.0.body', 'text': draft['claims'][0]['text'], 'feature_ids': ['search'],
                              'supported': True, 'reason': 'Approved search claim in fixture'}]}
    preliminary = validate.report_for(post, out, draft, history, judge, None, evidence)
    viewer = {'model': 'test-fixture', 'reviewer': 'fixture-viewer', 'input_digest': preliminary['viewer_input_digest'],
              'about_2s': 'Find a saved idea', 'about_10s': 'Search notes by meaning',
              'checks': {k: True for k in quality_judge.VIEWER_CHECKS}, 'issues': []}
    report = validate.report_for(post, out, draft, history, judge, viewer, evidence)
    assert report['verdict'] == 'PASS', report['errors']
    # Unknown editable text is still fail-closed; renderer controls alone are exempt.
    copy = json.loads((out / 'copy.json').read_text())
    copy['slides'][0]['unknown_public_copy'] = 'A made-up guarantee'
    (out / 'copy.json').write_text(json.dumps(copy))
    changed = validate.report_for(post, out, draft, history, judge, viewer, evidence)
    assert 'copy.unreviewed' in {e['code'] for e in changed['errors']}


def test_nested_renderer_labels_are_public_and_linted(tmp_path):
    script = static_script(tmp_path)
    data = json.loads(script.read_text())
    data['slides'][0]['crops'] = [{'label': 'Skwirl works instantly', 'asset': 'ui', 'crop': [0, 0, 20, 20]}]
    assert any(e['code'] == 'truth.unsupported' for e in validate_copy.validate_copy(data))
    assert 'Skwirl works instantly' in {u['text'] for u in validate_copy.public_units(data)}


def test_reel_evidence_requires_actual_video_audio_binding(tmp_path):
    qa = tmp_path / 'qa'
    (qa / 'evidence').mkdir(parents=True)
    (tmp_path / 'reel.mp4').write_bytes(b'local fixture video')
    (tmp_path / 'cover.png').write_bytes(b'local fixture cover')
    (qa / 'evidence/audio.wav').write_bytes(b'local fixture extracted audio')
    (qa / 'evidence/sheet-01.png').write_bytes(b'local fixture sheet')
    args = ['sh', str(ENGINE / 'bin/make-reel.sh'), '--evidence', str(tmp_path), 'reel']
    assert subprocess.run(args, capture_output=True).returncode == 1
    assert json.loads((qa / 'evidence.json').read_text())['pending']
    vh = hashlib.sha256((tmp_path / 'reel.mp4').read_bytes()).hexdigest()
    ah = hashlib.sha256((qa / 'evidence/audio.wav').read_bytes()).hexdigest()
    (qa / 'transcript.json').write_text(json.dumps({'video_sha256': vh, 'audio_sha256': ah,
                                                 'words': [{'text': 'Hello', 'start': 0, 'end': .5}]}))
    (qa / 'rendered-evidence.json').write_text(json.dumps({'video_sha256': vh,
        'key_text_boxes': [{'bbox': [100, 300, 500, 100]}],
        'captions': {'burned_in': True, 'words': [{'text': 'Hello', 'start': 0, 'end': .5, 'bbox': [100, 1400, 500, 100], 'lines': 1}]}}))
    assert subprocess.run(args, capture_output=True).returncode == 0
    evidence = json.loads((qa / 'evidence.json').read_text())
    assert not evidence['pending'] and evidence['transcript']['words'][0]['text'] == 'Hello'
    assert (qa / 'report.md').read_text().startswith('Verdict: PENDING')
    (tmp_path / 'reel.mp4').write_bytes(b'changed fixture render')
    assert subprocess.run(args, capture_output=True).returncode == 1
    assert json.loads((qa / 'evidence.json').read_text())['transcript'] == {}
