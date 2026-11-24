# Skwirl Runner

<img src="plugin/.claude-plugin/icon.png" width="72" alt="Skwirl logo">

Skwirl Runner turns saved links into searchable Markdown notes. This repository contains the Python runner, the local recall skill and MCP server, the hosted Claude Code plugin, the iPhone Shortcut source, and the GitHub Actions processing workflow. The Worker and web app source are maintained privately. For hosted capture and connectors, open [Skwirl](https://skwirl.app/app).

## Run locally

On macOS, use Homebrew and Python 3.11 or later. The installer sets up FFmpeg, yt-dlp, the Python virtual environment, and `.env`. Add a Groq key for transcription and note extraction. [Groq keys](https://console.groq.com/keys)

```sh
git clone https://github.com/Parthuss/skwirl-runner.git
cd skwirl-runner
bash install.sh
```

On Linux, install FFmpeg and yt-dlp with your package manager, then run the Python setup and put `GROQ_API_KEY` in `.env`.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[mcp]'
.venv/bin/python -m stash doctor
```

Save a link and search the resulting note. Use the URL of a public reel you can access.

```sh
.venv/bin/python -m stash add 'https://www.instagram.com/reel/EXAMPLE/' --process
.venv/bin/python -m stash search 'agent memory'
```

Markdown notes live in `vault/`, downloaded media in `media/`, and the local index in `stash.sqlite`. `stash reindex` rebuilds the search index from the vault. Processing with Groq sends media and extracted inputs to Groq. Search runs locally and downloads an embedding model on first use.

For optional project suggestions in owner notes, set `STASH_OWNER_PROJECTS` in `.env` to a comma-separated list of project names. The extraction provider receives those names when it creates the note.

## Connect Claude Code

For a local vault, run these commands from the runner checkout after installing the `mcp` extra.

```sh
claude mcp add --scope user stash -- "$PWD/.venv/bin/python" -m stash.mcp_server
mkdir -p "$HOME/.claude/skills"
cp -r stash-recall "$HOME/.claude/skills/stash-recall"
```

For a hosted Skwirl library, open **Set up → Connect ChatGPT or Claude** in Skwirl and copy the Claude Code install command. It uses your personal plugin key with the `Parthuss/skwirl-runner` marketplace.

## Capture from iPhone

Install the hosted Shortcut from the Skwirl setup screen. To build it yourself on macOS, install Cherri and set `STASH_WORKER_URL` in `.env` to the web app URL. `sh shortcuts/build.sh` signs the Shortcut at `shortcuts/Skwirl.shortcut`. You can pass an output file as the first argument. The Shortcut opens the app in Safari with the link you shared and uses your existing sign-in.

For a local vault, use `shortcuts/Stash-icloud.cherri` as the source of an iCloud inbox Shortcut and run `.venv/bin/python -m stash watch` on the Mac to process shared links.

## Process a remote queue

Remote processing requires access to a compatible Worker. For a trusted Mac processing owner saves, set `STASH_WORKER_URL` and the legacy `STASH_SECRET` in `.env` and leave `STASH_PROCESSOR_SECRET` unset. Launch the daemon with `.venv/bin/python -m stash daemon` or configure it to start at login. [macOS daemon setup](stash/launchd/README.md)

The GitHub Actions workflow uses a guest-only processor credential supplied by the Worker operator. Only enable it for a queue you operate or have permission to process.

- In a fork, set the Actions repository variable `STASH_ENABLED` to `true`.
- Configure `STASH_WORKER_URL`, `STASH_PROCESSOR_SECRET`, and a Groq key via `GROQ_API_KEY` or `GROQ_API_KEYS` in Actions secrets. Keep the owner credential on the trusted Mac.
- Run the `process` workflow manually or let it run on its five-minute schedule. The status summary includes processor outcomes and counts.

For a quiet daemon run in a private terminal, `STASH_DEBUG_PROCESS_LOGS=1` enables detailed diagnostics. CI always uses summary logging. [Processing workflow](.github/workflows/process.yml)

## License

The runner is available under the Functional Source License 1.1 with an MIT future license. [License terms](LICENSE)
