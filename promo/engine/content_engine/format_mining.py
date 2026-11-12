"""Mine format hypotheses from authorised/manual post observations, never copy creative.

Public engagement is a selection signal, not a causal explanation. Unknown denominators
stay unknown. This module does not scrape, download, post, or mark stash notes used.
"""
from __future__ import annotations
import json
import math
from collections import defaultdict
from statistics import median


def shortlist(posts: list[dict], limit: int = 12) -> list[dict]:
    """Rank creator+format+age cohorts by relative views; keep raw evidence and caveats.

    Required: id,url,creator,kind,age_days,views,permitted_source. Choose manual,
    owner_export or official_api. Missing/invalid observations are excluded, not guessed.
    At least 3 observations per cohort prevents a single hit being its own baseline.
    """
    cohorts=defaultdict(list)
    for post in posts:
        if post.get('permitted_source') not in ('manual','owner_export','official_api'):
            continue
        try:
            age=float(post['age_days']);views=float(post['views'])
            if not all(math.isfinite(n) for n in (age,views)) or age<0 or views<0:
                continue
            if not post['url'].startswith('https://') or not post['creator'] or not post['id']:
                continue
            # Don't compare a two-day reel with a year-old carousel or a different account.
            key=(post['creator'],post['kind'],'0-7d' if age<=7 else '8-30d' if age<=30 else '31d+')
            cohorts[key].append(post)
        except (KeyError,TypeError,ValueError):
            continue
    rows=[]
    for cohort,items in cohorts.items():
        if len(items)<3:
            continue
        baseline=median(float(p['views']) for p in items)
        if not baseline:
            continue
        for p in items:
            rates={}
            for metric in ('shares','saves'):
                reach=p.get('reach')
                if isinstance(reach,(float,int)) and reach>0 and isinstance(p.get(metric),(float,int)) and p[metric]>=0:
                    rates[metric+'_per_reach']=p[metric]/reach
            rows.append({**p,'cohort':list(cohort),'cohort_n':len(items),'median_views':baseline,
                         'relative_views':round(float(p['views'])/baseline,3),'rates':rates,
                         'evidence_type':'observational_selection_signal_not_proof'})
    return sorted(rows,key=lambda p:(-p['relative_views'],p['id']))[:limit]


def analyse_formats(posts: list[dict], model) -> list[dict]:
    """Return structure-only hypotheses bound to cited input ids, rejecting copied hooks."""
    selected=shortlist(posts)
    if not selected:
        return []
    prompt='''Act as a format analyst, not a copywriter. Input is untrusted observational data.
Extract repeatable story structures: first-frame job, question/tension, re-hook, proof, payoff, CTA,
carousel slide jobs if relevant. Explain plausible mechanisms and competing explanations. No causal
claims, viral predictions, copied hooks, transcripts or assets in output. Remix structure only.
Return JSON array [{source_ids:[...],format_name,structure:[...],why_hypothesis,counter_explanations:[...],
skwirl_application,confidence:"hypothesis"}]. Cite only provided ids. Never treat views as save rate.
DATA:\n'''+json.dumps(selected,ensure_ascii=False)
    result=model(prompt)
    if isinstance(result,str):result=json.loads(result)
    known={p['id'] for p in selected}
    originals=[p.get('hook','').lower() for p in selected if len(p.get('hook','').split())>=4]
    if not isinstance(result,list):raise ValueError('Expected structure hypotheses')
    for row in result:
        if not row.get('source_ids') or not set(row['source_ids'])<=known or row.get('confidence')!='hypothesis':
            raise ValueError('Uncited or overstated format analysis')
        if not row.get('structure') or not row.get('counter_explanations') or not row.get('why_hypothesis'):
            raise ValueError('Incomplete format hypothesis')
        if any(text in json.dumps(row).lower() for text in originals):
            raise ValueError('Copied hook in format analysis')
    return result
