# Design: preview-orphan-prune

## 判定边界：文件存在即 fail-closed

prune 的孤儿判定以**文件存在**为第一边界，而不是解析结果：

- `preview.json` 存在 → 跳过（owner 登记存在；解析失败也跳过，避免把损坏登记误判为无主）。
- `instance.json` 存在 → 解析 pid；解析失败 → 跳过；pid 存活 → 跳过。
- `agent-service/process/instance.json` 存在 → 同理解析 pid；解析失败或存活 → 跳过。
- 三者皆无（或记录不存在）→ 孤儿，进入删除。

理由：解析容错（readJson 返回 null）服务于读取方，但删除是不可逆动作；"文件存在但读不懂"必须按有主/未知处理。

## 进程存活判定

复用既有 `processAlive`（POSIX 用 ps 排除僵尸进程，Windows 用 kill 0 + EPERM）。不做 HTTP 健康检查：pid 存活即视为有使用方，避免网络依赖与误判；已死 pid 的残留记录不构成保留理由。

## 删除语义

复用 `assertPurgeTargetSafe`（预览根内、真实目录、非符号链接）+ `fs.rmSync(recursive, force: false)`，与 purge 完全一致：符号链接按条目 unlink，不跟随。单目录异常捕获后记为 skipped/failed 原因，继续扫描。

## 接口形态

- `preview-lifecycle.ts` 导出同步 `pruneOrphanPreviews({ dataRoot? })`，返回 `{ schemaVersion, results: [{ instance, status: 'pruned'|'skipped', reason? }] }`。
- CLI `web preview prune [--json]`：无位置参数、无 owner 要求（这正是其用途）；非 JSON 输出逐项行与计数。
- 不新增状态库或登记；prune 是无状态扫描。

## 技能两层

- `buildr-dev-preview`：验收完成后 `stop --purge` 清理本任务预览（已有要求，强化为明确动作）。
- `task-finish`：收尾"安全删除"节加入——本轮使用过预览时列出并 purge 本任务预览；调用 `web preview prune` 清理无主残留。产品命令兜底，不依赖记忆。

## 取舍

- 不做自动 TTL/后台回收：删除时机由收尾显式触发，避免运行中实例被误清。
- 不删除有 owner 但已停止的目录：那是 stop 默认保留数据的复用承诺，归 owner 显式 purge。