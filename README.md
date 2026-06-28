# Claude++
中文 | [English](./README_EN.md)

Claude++ 是一个终端优先的 Claude 导出恢复工具。它把官方导出的 ZIP 读入本地 SQLite，导出 Markdown，生成续写提示，并重建 Claude Desktop 可识别的本地会话文件。现在同时支持中转站版本和官方账号登录版本。

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
- 支持中转站 Claude Desktop 和官方账号 Claude Desktop 两种恢复模式

## 不做什么

- 不会把对话写回 Claude 的服务器历史
- 不会恢复原始的服务器端对话 ID 或时间戳
- 不会使用私有或未公开的 Claude API
- 不会修改 Claude Web 的服务器端对话列表

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
```

默认数据库路径是 `./.claude-history-rescue/history.sqlite`。
`serve` 提供 JSON 和 Markdown 接口，适合终端和脚本集成。

## Claude Desktop restore

Claude++ 有两个桌面端恢复版本：

- `desktop-restore`：中转站版本，面向 `Claude-3p/local-agent-mode-sessions`
- `desktop-restore-official`：官方账号登录版本，面向 `Claude/claude-code-sessions` 和 `~/.claude/projects`

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
