"""Skwirl content engine: stage approved posts, publish them on time, learn from how they did.

Pipeline (see promo/engine/README.md):
  research (weekly crew task) -> make (weekly crew task, Remotion + Kokoro + content-qa)
  -> stage (uploads media + queue, asks Parth on Telegram) -> tick (GitHub Actions cron: approvals + publish)
  -> insights (48 h and 7 d snapshots into performance.json, read by the next research run).
"""
