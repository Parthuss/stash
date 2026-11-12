#!/usr/bin/env python3
"""Local-only quality planning and validation. Never stages, sends or publishes."""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from content_engine.quality_flow import cli_model, generate_plan, planning_history, parse_model_json
from content_engine.quality_judge import run_judge, judge_packet, validate_judge
from content_engine.validate import validate_post


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='cmd',required=True)
    p=sub.add_parser('ideate');p.add_argument('--model');p.add_argument('--out',type=Path,required=True)
    p=sub.add_parser('judge');p.add_argument('plan',type=Path);p.add_argument('--model',default='sonnet');p.add_argument('--out',type=Path,required=True)
    p=sub.add_parser('validate');p.add_argument('post_dir',type=Path);p.add_argument('--post',type=Path,required=True)
    args=parser.parse_args();root=Path(__file__).resolve().parents[3]
    if args.cmd=='ideate':
        result=generate_plan(root,cli_model(args.model) if args.model else None)
    elif args.cmd=='judge':
        plan=json.loads(args.plan.read_text());history=planning_history(root);reviews=[]
        model=cli_model(args.model)
        for draft in plan['drafts']:
            platforms={'instagram':{'caption':draft['caption']}}
            def call(prompt):return parse_model_json(model(prompt))
            review=run_judge(draft,history,call,platforms)
            errors=validate_judge(review,judge_packet(draft,history,platforms))
            reviews.append({'id':draft['id'],'review':review,'errors':errors,'verdict':'FAIL' if errors else 'PASS'})
            print(draft['id'],reviews[-1]['verdict'],flush=True)
        result={'status':'COPY_REVIEW_ONLY_NO_MEDIA_APPROVAL','reviews':reviews}
    else:
        report=validate_post(json.loads(args.post.read_text()),args.post_dir,planning_history(root),root)
        print(report['verdict']);return 0 if report['verdict']=='PASS' else 1
    args.out.parent.mkdir(parents=True,exist_ok=True)
    args.out.write_text(json.dumps(result,indent=2,ensure_ascii=False,default=lambda x:x.isoformat())+'\n')
    print(args.out)
    return 0

if __name__=='__main__':raise SystemExit(main())
