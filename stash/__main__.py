import sys

from ._public_logs import in_ci, local_debug_enabled, run_public_process

args = sys.argv[1:]
if args[:1] == ["daemon"] and ("--quiet" in args or in_ci()):
    if local_debug_enabled():
        args = [arg for arg in args if arg != "--quiet"]
    else:
        if "--quiet" not in args:
            args.append("--quiet")
        sys.exit(run_public_process(args))

from .cli import main

sys.exit(main(args))
