# Claude++

中文:

Claude++ 是一个终端优先的 Claude 导出恢复工具。它可以把官方导出的 ZIP 读入本地 SQLite，导出 Markdown，生成续写提示，并把对话恢复成 Claude Desktop 可识别的本地会话文件。

English:

Claude++ is a terminal-first recovery tool for Claude exports. It imports official export ZIPs into local SQLite, exports Markdown, generates rehydration prompts, and rebuilds local session files that Claude Desktop can read.

## 功能 / What it does

- 导入官方 Claude 导出 ZIP 到本地数据库 / Import official Claude export ZIPs into a local database
- 按标题、正文、项目名搜索 / Search titles, message bodies, and project names
- 导出对话为 Markdown / Export conversations to Markdown
- 生成手动续写提示 / Generate prompts for starting a fresh follow-up chat
- 读取项目、记忆和用户元数据 / Import projects, memories, and user metadata
- 生成 Claude Desktop 本地会话文件 / Create Claude Desktop local-session files from an official export

## 不做什么 / What it does not do

- 不会把对话写回 Claude 的服务器历史 / It does not write back to Claude's server-side history
- 不会恢复原始的服务器端对话 ID 或时间戳 / It does not restore original server-side IDs or timestamps
- 不会使用私有或未公开的 Claude API / It does not use private or undocumented Claude APIs
- 不会修改 Claude Web 的服务器端对话列表 / It cannot update Claude Web's server-side conversation list

## 安装 / Install

```bash
cd claude-history-rescue-web
npm install
```

## 用法 / Usage

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

默认数据库路径是 `./.claude-history-rescue/history.sqlite`。
`serve` 提供 JSON 和 Markdown 接口，适合终端和脚本集成。

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
