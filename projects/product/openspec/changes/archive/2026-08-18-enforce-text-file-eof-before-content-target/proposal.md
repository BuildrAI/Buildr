## Why

Buildr Core 已限定文本文件 EOF 只能保留一个换行符，但缺少正反例；Task Development 也没有在形成 Content Target 前明确检查本次新增文本文件，导致 Agent 仍可能把“结尾换行符”和“末尾空白行”混淆，并在正式验证后才发现内容漂移。

## What Changes

- 在 required Buildr Core 的现有 EOF 规则中补充 `...\n` 与 `...\n\n` 正反例，继续明确该约束只针对文件末尾，不限制正文内部的合理空行。
- 要求 Task Development 在调用 `observe` 形成 Content Target 前，检查 Task 本次新增的全部文本文件；Git-backed scope 必须覆盖 tracked-added 与未忽略的 untracked 文件。
- 要求 Agent 创建或重写文本文件时直接遵守 Core，并且不把未触达的存量 EOF 清理扩大到当前 Task。
- 增加静态契约测试，锁定 Core 与 Task Development 的职责分离和关键措辞。
- 不增加 Application 自动拦截、CLI 命令或存量文件批量清理；不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-package-assets`：required Core 必须以正反例明确 EOF 换行符与末尾空白行的区别，并保持正文空行不受限。
- `task-development`：Task Development Skill 必须在 Content Target observation 前执行新增文本文件 EOF 检查，并明确覆盖 untracked 文件。

## Impact

- 产品资产：`services/buildr/package/targets/workspace/rules/buildr/core.md`、`services/buildr/package/targets/workspace/skills/buildr/task-development/SKILL.md`。
- 产品规范：`buildr-package-assets`、`task-development`。
- 验证：Buildr package/Task Development 静态契约测试。
- 不改变公开 API、SQLite、Content Target identity 算法、Git inventory 或 runtime adapter。
