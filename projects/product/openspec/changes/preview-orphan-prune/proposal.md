# Proposal: preview-orphan-prune

## Why

预览 `stop` 默认保留数据、`--purge` 才删除实例根；验收方若只 stop 不 purge，隔离根（可达数 GB）就成为无主残留。本机曾累积 13 个无 owner、无存活进程的孤儿目录共约 15.2 GB，托管 `preview list/stop` 因无 owner 登记而管不到它们，只能手工删除。purge 符号链接误判修复后托管清理已可用，但仍缺一个确定性的兜底：收尾时清理本任务预览、并扫描清理无主残留。

## What Changes

- 产品新增 `buildr web preview prune [--json]`：扫描预览根，仅删除**无 owner 登记且无存活进程**的孤儿实例目录；逐项报告 pruned/skipped 及原因。
- 安全语义 fail-closed：owner 文件存在（含无法解析）、实例或后台记录存在但无法确认进程已死，一律跳过；删除复用 purge 的目标安全语义（预览根内真实目录、符号链接按条目删除不跟随）。
- `stop` 默认保留数据、owner 匹配等既有语义不变；有 owner 的目录永远归托管 stop/purge，prune 不触碰。
- 技能源同步：`skills/buildr-dev-preview` 明确验收后 `stop --purge`；`task-finish` 收尾动作加入本任务预览清理与 prune 扫描，形成技能自觉 + 产品兜底两层。
- 知识文档 `buildr-data-design.md` 同步 prune 语义。

## Capabilities

### Modified

- `preview-environment-reuse`：新增"无主预览残留清理"要求（prune 的判定边界、删除语义、逐项报告与失败隔离）。

## Impact

- 代码：`services/buildr/src/web/application/preview-lifecycle.ts`（prune 实现）、`instance-lifecycle.ts`（CLI 分发）、`interfaces/cli/web.ts`（帮助）。
- 测试：新增 prune 集成回归；CLI 帮助单元断言。
- 技能源：`skills/buildr-dev-preview/SKILL.md`、`services/buildr/resources/workspace/skills/buildr/task-finish/SKILL.md`。
- 兼容：纯新增子命令与可选输出，旧调用方不受影响。