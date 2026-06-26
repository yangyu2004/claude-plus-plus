# Claude History Rescue Web

Import a Claude export ZIP into a local SQLite archive, browse it in a local web UI, export Markdown, and generate a rehydration prompt for starting a fresh conversation.

## What this does

- Imports official Claude export ZIPs into a local database
- Shows a left-sidebar conversation list in a local web viewer
- Supports search across titles and message bodies
- Exports conversations to Markdown
- Generates a prompt for manually resuming a conversation in a new chat
- Imports project archives, memories, and user metadata from the export ZIP
- Can create Claude Desktop local-agent session files from an official export so imported chats can appear in the desktop sidebar

## What this does not do

- It does not write conversations back into Claude's server-side history
- It does not restore original server-side conversation IDs or timestamps in the Claude web app
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

The local database is stored at `./.claude-history-rescue/history.sqlite` by default.
Open the local viewer at `http://127.0.0.1:8787`.

## Claude Desktop restore

`desktop-restore` reads an official Claude export ZIP and creates local Claude Desktop agent-session files under:

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
