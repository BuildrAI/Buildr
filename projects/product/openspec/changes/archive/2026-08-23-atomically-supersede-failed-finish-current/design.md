## Context

reconciliation recovery 需要以新 run identity 写入 terminal row，但 `finalizeTaskFinishPersistence` 只允许 current row 缺失或 run ID 与新 run 相同。旧 failed current row 必须保留到远端证明和 carrier cleanup 全部完成，因此不能提前删除；直接放宽 run ID 检查又会产生覆盖并发更新的风险。

## Goals / Non-Goals

**Goals:**

- 在同一 SQLite transaction 内，以旧 run ID 与精确 serialized run digest fencing 后原子写入新 terminal row。
- 对旧 row 缺失、kind/status/ID/digest 漂移保持零写入。
- 保持普通 finalize 的同-run限制不变。

**Non-Goals:**

- 不提前删除旧 current row，不增加两阶段临时状态。
- 不允许调用方绕过 reconciliation eligibility 或提交外部 proof。
- 不改变 carrier cleanup、repository topology 与远端包含规则。

## Decisions

1. 扩展内部 Persistence port，允许 Application 在 recovery 时传入 `{runId, runDigest}` 的 `supersededCurrent` fence。选择 digest 而非只比较 run ID，避免旧 run 在读取后被 lease、phase 或其他状态更新却仍遭覆盖。
2. Repository 在 `BEGIN IMMEDIATE` 后读取 current row，并从数据库 payload 重算 digest；仅当 row 为 `run`、状态 `failed`、ID/digest 精确匹配且不同于新 run 时写 terminal。
3. 普通 finalize 不带 fence，继续执行原有 current run ID 一致性检查。reconciliation 只从 Product Persistence read result取得 fence，不接受 CLI/caller提供。

## Risks / Trade-offs

- [cleanup 后 digest 漂移会阻止 terminal] → 保留已完成 cleanup effects，重试重新读取 current 并幂等确认 carrier 不存在。
- [错误 fence 覆盖其他 run] → transaction 内同时校验 task、run ID、kind、failed status 与 digest。
- [内部参数被普通路径误用] → Application 仅在 closed recovery eligibility 成立时传入，SQLite tests锁定普通路径仍冲突。
