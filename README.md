# Claude++
中文 | [English](./README_EN.md)

Claude++ 是一个终端优先的 Claude 导出恢复工具。它把官方导出的 ZIP 读入本地 SQLite，导出 Markdown，生成续写提示，并重建 Claude Desktop 或 Codex Desktop 可识别的本地会话文件。现在同时支持中转站 Claude Desktop、官方账号 Claude Desktop 和 Codex Desktop 三种恢复模式。

## 背景

Claude 的对话在日常使用里很容易变成“只进不出”的内容：你能在产品里继续聊，却很难把历史对话完整拿出来、按自己的方式检索、整理和复用。官方导出能解决一部分备份问题，但它更像原始数据打包，而不是一个方便继续工作的工具。

Claude++ 就是为了解决这个落差而做的。它把官方导出变成本地可查询、可导出、可重建的档案，让你能在终端里直接完成恢复、检索、续写和 Claude Desktop 会话重建，而不是反复依赖网页界面。

## 主要功能

- 导入官方 Claude 导出 ZIP 到本地数据库
- 按标题、正文、项目名搜索
- 导出对话为 Markdown
- 生成手动续写提示
- 读取项目、记忆和用户元数据
- 生成 Claude Desktop 本地会话文件
- 生成 Codex Desktop 本地 rollout 文件和左侧会话列表索引
- 支持中转站 Claude Desktop、官方账号 Claude Desktop 和 Codex Desktop 三种恢复模式

## 不做什么

- 不会把对话写回 Claude 的服务器历史
- 不会恢复原始的服务器端对话 ID 或时间戳
- 不会使用私有或未公开的 Claude API
- 不会修改 Claude Web 的服务器端对话列表
- 不会把 Claude 历史写回 OpenAI/Codex 的服务器端历史

## 安装

```bash
cd claude-history-rescue-web
npm install
```

## 用法

```bash
claude-history-rescue-web import ~/Downloads/claude-export.zip
claude-history-rescue-web serve --port 8787
claude-history-rescue-web list
claude-history-rescue-web search "recovery"
claude-history-rescue-web export --out ./archive
claude-history-rescue-web rehydrate --id conv_1 --out prompt.md
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip --write
claude-history-rescue-web desktop-restore-official ~/Downloads/claude-export.zip --write --cwd ~/Desktop/Claude
claude-history-rescue-web codex-restore ~/Downloads/claude-export.zip --write --cwd ~/Documents/Work
```

默认数据库路径是 `./.claude-history-rescue/history.sqlite`。
`serve` 提供 JSON 和 Markdown 接口，适合终端和脚本集成。

## Desktop restore

Claude++ 有三个桌面端恢复版本：

- `desktop-restore`：中转站版本，面向 `Claude-3p/local-agent-mode-sessions`
- `desktop-restore-official`：官方账号登录版本，面向 `Claude/claude-code-sessions` 和 `~/.claude/projects`
- `codex-restore`：Codex Desktop 版本，面向 `~/.codex/sessions` 和 `~/.codex/state_5.sqlite`

### 中转站版本

`desktop-restore` 读取官方 Claude 导出 ZIP，并在以下目录创建本地会话文件：

```bash
~/Library/Application Support/Claude-3p/local-agent-mode-sessions
```

默认是 dry run。加上 `--write` 后，会创建 `local_<uuid>.json`、匹配的 session 目录、`.claude/.claude.json`、`outputs/`、`uploads/`、Claude Desktop 风格的 `audit.jsonl`，以及 `.claude/projects/imported/*.jsonl` transcript。加上 `--overwrite` 可重建已恢复的会话。

```bash
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip --limit 3
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip --write
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip --write --overwrite
```

如果重启后 Claude Desktop 侧边栏没有出现新条目，退出 Claude Desktop 后执行：

```bash
claude-history-rescue-web desktop-restore ~/Downloads/claude-export.zip --write --update-read-state
```

read-state 索引存放在 Electron Local Storage，Claude Desktop 运行时会被锁定。工具会把被覆盖的 session 文件和 read-state 值备份到 `.claude-history-rescue/backups/`。

### 官方账号登录版本

`desktop-restore-official` 读取官方 Claude 导出 ZIP，并写入当前官方 Claude Desktop 使用的本地结构：

```bash
~/Library/Application Support/Claude/claude-code-sessions
~/.claude/projects
```

它会写入 `local_<uuid>.json` 会话元数据，以及对应的 `.jsonl` transcript。这个版本会清理 Claude 导出里的 `thinking`、`tool_use`、`tool_result` 等不可见或工具噪声内容，只保留正常可读的用户和助手正文。

```bash
claude-history-rescue-web desktop-restore-official ~/Downloads/claude-export.zip --limit 3
claude-history-rescue-web desktop-restore-official ~/Downloads/claude-export.zip --write --cwd ~/Desktop/Claude
claude-history-rescue-web desktop-restore-official ~/Downloads/claude-export.zip --write --overwrite --cwd ~/Desktop/Claude
```

`--cwd` 会影响 transcript 在 `~/.claude/projects` 里的项目目录名。建议填你平时在 Claude Desktop 里使用的工作目录。写入后完全退出 Claude Desktop，再重新打开，让侧边栏重新扫描本地会话。

### Codex Desktop 版本

`codex-restore` 读取官方 Claude 导出 ZIP，并写入 Codex Desktop 当前使用的本地结构：

```bash
~/.codex/sessions
~/.codex/state_5.sqlite
~/.codex/session_index.jsonl
```

它会为每个 Claude 对话生成 Codex rollout `.jsonl`，再把对应线程写入 `threads` 表，让对话出现在 Codex Desktop 左侧列表里。打开会话时可看到用户和助手正文；Claude 导出里的 `thinking`、`tool_use`、`tool_result` 等不可见或工具噪声内容会被过滤。

```bash
claude-history-rescue-web codex-restore ~/Downloads/claude-export.zip --limit 3
claude-history-rescue-web codex-restore ~/Downloads/claude-export.zip --write --cwd ~/Documents/Work
claude-history-rescue-web codex-restore ~/Downloads/claude-export.zip --write --overwrite --cwd ~/Documents/Work
```

默认是 dry run。真正写入前建议完全退出 Codex Desktop，因为 `state_5.sqlite` 可能正在被应用占用。工具会先备份 `state_5.sqlite`、WAL/SHM 文件和 `session_index.jsonl` 到 `~/.codex/.claude-plus-plus-backups/`，再写入新会话。`--cwd` 会影响 Codex 线程记录里的工作目录，建议填你希望这些历史会话归属的项目目录。
