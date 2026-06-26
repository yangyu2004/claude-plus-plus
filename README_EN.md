# Claude++
[中文](./README.md) | English

Claude++ is a terminal-first recovery tool for Claude exports. It imports official export ZIPs into local SQLite, exports Markdown, generates rehydration prompts, and rebuilds local session files that Claude Desktop can read.

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

## What it does not do

- It does not write back to Claude's server-side history
- It does not restore original server-side IDs or timestamps
- It does not use private or undocumented Claude APIs
- It cannot update Claude Web's server-side conversation list

## Install

```bash
cd claude-history-rescue-web
npm install
```

## Usage

```bash
claude-history-rescue-web import ~/Downloads/claude-export.zip
claude-history-rescue-web serve --port 8787
claude-history-rescue-web list
claude-history-rescue-web search "recovery"
claude-history-rescue-web export --out ./archive
claude-history-rescue-web rehydrate --id conv_1 --out prompt.md
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip --write
```

The default database path is `./.claude-history-rescue/history.sqlite`.
`serve` exposes JSON and Markdown endpoints for terminal workflows and integrations.

## Claude Desktop restore

`desktop-restore` reads an official Claude export ZIP and creates local Claude Desktop session files under:

```bash
~/Library/Application Support/Claude-3p/local-agent-mode-sessions
```

By default it is a dry run. Add `--write` to create `local_<uuid>.json`, the matching session directory, `.claude/.claude.json`, `outputs/`, `uploads/`, a Claude Desktop-style `audit.jsonl`, and the `.claude/projects/imported/*.jsonl` transcript used by the conversation view. Add `--overwrite` to rebuild sessions that were already restored.

```bash
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip --limit 3
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip --write
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip --write --overwrite
```

If new items do not appear in Claude Desktop's sidebar after restart, quit Claude Desktop and run:

```bash
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip --write --update-read-state
```

The read-state index lives in Electron Local Storage and is locked while Claude Desktop is running. The tool backs up overwritten session files and read-state values under `.claude-history-rescue/backups/`.
