## Context

Buildr 对话运行测试时，连接隔离环境将 `$TMPDIR` 设为绑定目录下的 `tmp/`。验证运行生成的 `buildr-<kind>-evidence-*` 内含 `timing.json`，其中 `evidenceLifecycle.evidenceRetention` 为 `transient`、`cleanupStatus` 为 `retained`，属于可安全回收的瞬时测试产物；而无有效标记的目录继续保守保留。

同时，`claude-code` 执行器按对话租约写入 `connections/claude-code/model-bindings/<64hex>/claude-config/projects/<slug>/<uuid>.jsonl`（部分会话附带 `<uuid>/` 子目录存放 `subagents` 与 `tool-results`）。

## Decisions

- **瞬时验证证据校验**：仅当 `buildr-[a-z-]+-evidence-[A-Za-z0-9]+` 目录下存在本用户所有的普通 `timing.json` 文件，且其 `schemaVersion === "buildr.verification-timing/v1"`、`evidenceLifecycle.evidenceRetention === "transient"`、`evidenceLifecycle.cleanupStatus === "retained"`、且 `cleanupReference` 与 `summaryPath` 均精确匹配目标目录时，才允许在超过 24 小时稳定窗口且无进程占用后经由 `test-artifact` 自动清理。
- **Claude Code 原生引用与回收边界**：
  - `nativeSessionReferences` 与 `handoffNativeReferences` 收集所有 `codex`、`dsh`、`claude-code` 的对话头、尝试记录、原生工具内容及交接索引引用（含 `claude-config/projects/.../<uuid>` 源路径匹配）。
  - 对 `claude-code` 的单个会话级回收，仅枚举无同 UUID 伴生目录的独立 `<uuid>.jsonl`（以及超过稳定窗口、无占用、无引用），避免留下孤立的子智能体目录；若存在伴生 `<uuid>/` 目录，其在引用证明时仍用于保护整个绑定目录，待对话全部结束且无任何引用后由 `native-home` 整目录回收一并清理。
  - 自动维护继续不列出或不删除任何 `native-session` 与 `native-home` 候选。
