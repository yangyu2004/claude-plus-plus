# Claude++
[中文](./README.md) | English

Claude++ is a terminal-first recovery tool for Claude exports. It imports official export ZIPs into local SQLite, exports Markdown, generates rehydration prompts, and rebuilds local session files that Claude Desktop or Codex Desktop can read. It now supports the relay Claude Desktop layout, the official-account Claude Desktop layout, and the Codex Desktop sidebar layout.

## Background

Claude conversations are easy to accumulate and hard to reuse. You can keep talking inside the product, but exporting, searching, reorganizing, and reusing older conversations is awkward. Official exports help with backups, but they are closer to raw data dumps than to a working archive.

Claude++ was built to close that gap. It turns official exports into a local archive you can query, export, and rebuild from the terminal, so recovery and reuse stay fast even when the web UI is not the workflow you want.

## Highlights

- Import official Claude export ZIPs into a local database
- Search titles, message bodies, and project names
- Export conversations to Markdown
- Generate prompts for starting a fresh follow-up chat
- Import projects, memories, and user metadata
- Create Claude Desktop local-session files from an official export
- Create Codex Desktop rollout files and sidebar thread index rows
- Support relay Claude Desktop, official-account Claude Desktop, and Codex Desktop restore modes

## What it does not do

- It does not write back to Claude's server-side history
- It does not restore original server-side IDs or timestamps
- It does not use private or undocumented Claude APIs
- It cannot update Claude Web's server-side conversation list
- It does not write Claude history back to OpenAI/Codex server-side history

## Install

```bash
cd claude-plus-plus
npm install
```

## Usage

```bash
claude-plus-plus import ~/Downloads/claude-export.zip
claude-plus-plus serve --port 8787
claude-plus-plus list
claude-plus-plus search "recovery"
claude-plus-plus export --out ./archive
claude-plus-plus rehydrate --id conv_1 --out prompt.md
claude-plus-plus desktop-restore ~/Downloads/claude-export.zip
claude-plus-plus desktop-restore ~/Downloads/claude-export.zip --write
claude-plus-plus desktop-restore-official ~/Downloads/claude-export.zip --write --cwd ~/Desktop/Claude
claude-plus-plus codex-restore ~/Downloads/claude-export.zip --write --cwd ~/Documents/Work
```

The default database path is `./.claude-history-rescue/history.sqlite`.
`serve` exposes JSON and Markdown endpoints for terminal workflows and integrations.

## Desktop restore

Claude++ has three desktop restore variants:

- `desktop-restore`: relay version for `Claude-3p/local-agent-mode-sessions`
- `desktop-restore-official`: official-account version for `Claude/claude-code-sessions` and `~/.claude/projects`
- `codex-restore`: Codex Desktop version for `~/.codex/sessions` and `~/.codex/state_5.sqlite`

### Relay version

`desktop-restore` reads an official Claude export ZIP and creates local Claude Desktop session files under:

```bash
~/Library/Application Support/Claude-3p/local-agent-mode-sessions
```

By default it is a dry run. Add `--write` to create `local_<uuid>.json`, the matching session directory, `.claude/.claude.json`, `outputs/`, `uploads/`, a Claude Desktop-style `audit.jsonl`, and the `.claude/projects/imported/*.jsonl` transcript used by the conversation view. Add `--overwrite` to rebuild sessions that were already restored.

```bash
claude-plus-plus desktop-restore ~/Downloads/claude-export.zip --limit 3
claude-plus-plus desktop-restore ~/Downloads/claude-export.zip --write
claude-plus-plus desktop-restore ~/Downloads/claude-export.zip --write --overwrite
```

If new items do not appear in Claude Desktop's sidebar after restart, quit Claude Desktop and run:

```bash
claude-plus-plus desktop-restore ~/Downloads/claude-export.zip --write --update-read-state
```

The read-state index lives in Electron Local Storage and is locked while Claude Desktop is running. The tool backs up overwritten session files and read-state values under `.claude-history-rescue/backups/`.

### Official-account version

`desktop-restore-official` reads an official Claude export ZIP and writes the current official Claude Desktop local layout:

```bash
~/Library/Application Support/Claude/claude-code-sessions
~/.claude/projects
```

It writes `local_<uuid>.json` session metadata plus the matching `.jsonl` transcript. This version cleans export-only noise such as `thinking`, `tool_use`, and `tool_result`, keeping only readable user and assistant text.

```bash
claude-plus-plus desktop-restore-official ~/Downloads/claude-export.zip --limit 3
claude-plus-plus desktop-restore-official ~/Downloads/claude-export.zip --write --cwd ~/Desktop/Claude
claude-plus-plus desktop-restore-official ~/Downloads/claude-export.zip --write --overwrite --cwd ~/Desktop/Claude
```

`--cwd` controls the escaped project directory under `~/.claude/projects`. Use the same working directory you normally use in Claude Desktop. After writing, fully quit Claude Desktop and reopen it so the sidebar rescans local sessions.

### Codex Desktop version

`codex-restore` reads an official Claude export ZIP and writes the local layout used by Codex Desktop:

```bash
~/.codex/sessions
~/.codex/state_5.sqlite
~/.codex/session_index.jsonl
```

It creates a Codex rollout `.jsonl` for each Claude conversation, then inserts the matching row into the `threads` table so the conversation appears in the Codex Desktop sidebar. Opening the restored thread shows readable user and assistant text; export-only noise such as `thinking`, `tool_use`, and `tool_result` is filtered out.

```bash
claude-plus-plus codex-restore ~/Downloads/claude-export.zip --limit 3
claude-plus-plus codex-restore ~/Downloads/claude-export.zip --write --cwd ~/Documents/Work
claude-plus-plus codex-restore ~/Downloads/claude-export.zip --write --overwrite --cwd ~/Documents/Work
```

By default this is a dry run. Before writing, fully quit Codex Desktop because `state_5.sqlite` may be locked by the app. The tool backs up `state_5.sqlite`, WAL/SHM files, and `session_index.jsonl` under `~/.codex/.claude-plus-plus-backups/` before writing. `--cwd` controls the working directory stored on the imported Codex threads.
