#!/usr/bin/env python3
"""Actions entry point. The disabled path does not construct clients or open state."""
from __future__ import annotations
import os
import sys
from pathlib import Path


def main(argv=None):
    if os.environ.get('ENGINE_ENABLED', '').strip() != '1':
        print('Content engine disabled. Set ENGINE_ENABLED=1 after setup.')
        return 0
    command = (argv or sys.argv[1:] or ['tick'])[0]
    if command not in ('tick', 'insights', 'queue', 'research', 'make', 'pause', 'resume'):
        raise SystemExit('Unknown content command')
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from content_engine.config import Config
    from content_engine.cli import build, main as engine_main
    from content_engine import dashboard
    if command in ('tick', 'insights', 'queue'):
        result = engine_main([command])
        if command == 'insights':
            dashboard.export(build(Config.from_env()))
        return result
    from datetime import datetime, timezone
    from uuid import uuid4
    ctx = build(Config.from_env())
    at = datetime.now(timezone.utc).isoformat()
    state = ctx.store.get_json('state/paused.json') or {}
    # Console actions cannot arm publishing, even after a later scheduled tick.
    state.update(dry_run=True, at=at)
    if command in ('pause', 'resume'):
        state['paused'] = command == 'pause'
    else:
        ctx.store.put_json(f'state/jobs/pending/{uuid4()}.json', {'command': command, 'at': at, 'dry_run': True})
    ctx.store.put_json('state/paused.json', state)
    dashboard.export(ctx)
    print(f'{command}: safe request recorded; research/make run on the configured Mac agent')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
