"""python -m content_engine <command>   (run from promo/engine, or with PYTHONPATH=promo/engine)

  tick                      Telegram taps + token refresh + publish what's due   (GitHub Actions, every 15 min)
  insights                  48 h / 7 d snapshots + performance.json              (GitHub Actions, daily)
  init-schedule DIR --start YYYY-MM-DD [--time 22:30] [--every 2]   write a first DIR/schedule.json
  validate DIR [--no-qa]    check a batch without staging it
  stage DIR [--restage] [--no-qa]   upload + queue + ask Parth on Telegram   (Mac, end of the Make task)
  queue                     list what's queued
  approve ID | skip ID      same as the Telegram buttons
  pull-perf [--out FILE]    copy performance.json from the store for the research run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import insights, publisher, schedule, stage as stage_mod
from .config import Config
from .http import Http
from .instagram import Instagram
from .publisher import Ctx
from .store import from_config
from .telegram import Telegram
from .youtube import YouTube


def build(cfg: Config, need_store: bool = True) -> Ctx:
    store = from_config(cfg) if need_store else None
    ctx = Ctx(cfg=cfg, store=store)
    if cfg.has_telegram:
        ctx.tg = Telegram(cfg.tg_token, cfg.tg_chat, Http("telegram", cfg.secrets))
    if cfg.has_instagram and store is not None:
        token = publisher.current_ig_token(cfg, store)
        ctx.ig = Instagram(cfg.ig_user_id, token, cfg.ig_api_version, Http("instagram", cfg.secrets, timeout=120))
    if cfg.has_youtube:
        ctx.yt = YouTube(cfg.yt_client_id, cfg.yt_client_secret, cfg.yt_refresh_token,
                         Http("youtube", cfg.secrets, timeout=600))
    return ctx


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="content_engine", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("tick")
    sub.add_parser("insights")
    s = sub.add_parser("init-schedule")
    s.add_argument("dir", type=Path)
    s.add_argument("--start", required=True)
    s.add_argument("--time", default="22:30")
    s.add_argument("--every", type=int, default=2)
    s.add_argument("--force", action="store_true")
    for name in ("validate", "stage"):
        s = sub.add_parser(name)
        s.add_argument("dir", type=Path)
        s.add_argument("--no-qa", action="store_true")
        if name == "stage":
            s.add_argument("--restage", action="store_true")
    sub.add_parser("queue")
    for name in ("approve", "skip"):
        sub.add_parser(name).add_argument("id")
    s = sub.add_parser("pull-perf")
    s.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "performance.json")
    a = ap.parse_args(argv)
    cfg = Config.from_env()

    if a.cmd == "init-schedule":
        out = a.dir / "schedule.json"
        if out.exists() and not a.force:
            print(f"{out} exists (use --force to overwrite)")
            return 1
        out.write_text(json.dumps(schedule.init_schedule(a.dir, a.start, cfg.tz, a.time, a.every), indent=2,
                                  ensure_ascii=False) + "\n")
        print(f"wrote {out}: edit titles and times, then `validate`")
        return 0
    if a.cmd == "validate":
        errs = schedule.validate(schedule.load(a.dir), a.dir, require_qa=not a.no_qa)
        print("\n".join(errs) if errs else "OK: ready to stage")
        return 1 if errs else 0

    ctx = build(cfg)
    if a.cmd == "tick":
        if not (ctx.ig or ctx.yt):
            ctx.say("no platform connected yet: only reading Telegram (see SETUP.md)")
        publisher.tick(ctx)
    elif a.cmd == "insights":
        perf = insights.collect(ctx)
        ctx.say(f"performance.json: {len(perf['posts'])} posts")
    elif a.cmd == "stage":
        try:
            stage_mod.stage(ctx, a.dir, restage=a.restage, require_qa=not a.no_qa)
        except schedule.ScheduleError as e:
            print(e)
            return 1
    elif a.cmd == "queue":
        print(publisher.queue_text(ctx.store) or "Queue is empty.")
    elif a.cmd in ("approve", "skip"):
        p = ctx.store.get_json(f"posts/{a.id}.json")
        if not p:
            print(f"no post {a.id}")
            return 1
        print(publisher.apply_action(ctx, p, "ap" if a.cmd == "approve" else "sk"))
    elif a.cmd == "pull-perf":
        perf = ctx.store.get_json("performance.json") or {"posts": []}
        a.out.write_text(json.dumps(perf, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {a.out} ({len(perf['posts'])} posts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
