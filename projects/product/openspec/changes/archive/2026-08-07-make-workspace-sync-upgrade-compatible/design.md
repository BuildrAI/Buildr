## Context

当前 `openWorkspaceStructuredStore(..., { writable: true })` 已具备连续、逐版本、事务化 migration 能力，但 `sync` 只在后续业务写入路径触发该 writer；因此 Doctor 可以发现 pending 0005、0006，却不能由 workspace sync 自己完成升级。sync 的 source preflight 还会先校验 capability retirement；历史官方 contract 正文被澄清后，旧 workspace 的合法旧 bytes 不在当前单一 `integrity` 中，因而被误判为 drift。

变更必须遵守三个边界：SQLite 仍是 workspace-local 单一 authority；候选 Buildr runtime 不能写 retained canonical store；未知用户修改必须继续 fail closed，且 sync 不能在失败 preflight 后留下部分源资产修改。

## Goals / Non-Goals

**Goals:**

- 让显式 `buildr sync <agent> --target <workspace>` 在 source mutation 前完成 pending SQLite migrations。
- 让 retirement entry 能接受明确登记的历史官方 hash，并在运行时记录采用了 current 或 legacy hash 的可诊断结果。
- 保持 migration busy、drift、损坏、provenance 和未知 contract drift 的现有安全语义。

**Non-Goals:**

- 不迁移、删除或重写用户 `.buildr/asset-review/` observation/history 数据。
- 不添加 down migration、自动修复未知正文、第二个数据库 writer 或后台 scheduler。
- 不让 `doctor`、普通只读 inspect/list 或 runtime render 隐式写数据库。

## Decisions

### 1. 在 sync preflight 之后、源资产 mutation 之前执行 SQLite upgrade

sync 先完成环境、source plan、retirement 和 path safety preflight，再调用现有 canonical writable SQLite migration boundary；只有全部前置判断通过后才升级数据库并进入 source mutation。这样 capability drift 等无需迁移的阻塞不会触发数据库写入，数据库 migration 失败也不会产生源资产半更新。

备选方案是把 migration 放进任意 Task/business write，仍会让用户更新失败；或放到 source mutation 之后，会留下源资产已更新但 schema 未升级的中间状态，均不采用。

### 2. 复用现有 migration runner，不实现 sync 专用 SQL

sync 只负责调用 canonical structured-store writable opener/迁移入口；0005、0006 仍由随包 SQL scripts、ledger checksum 和 `BEGIN IMMEDIATE` 事务管理。迁移成功后即使后续 source mutation 失败，schema 也保持已升级的单调状态，下一次 sync 可从 source plan 重试。

### 3. retirement 使用 current integrity 加 legacyIntegrities

每个 retirement entry 保留当前 `integrity`，并可声明有限的 `legacyIntegrities`。运行时只有 hash 等于其中之一才视为官方旧版本；其他 hash 仍返回 drift。package validation 检查每项是 SHA-256、无重复且不与 current integrity 重复，避免把白名单变成任意绕过。

备选方案是按文件内容做模糊匹配或忽略 drift；这会把用户修改误判为官方内容，破坏退休安全边界，不采用。

### 4. 旧 hash 只用于退休判断，不改变历史或回执 authority

接受 legacy hash 后，sync 按既有 retirement 逻辑移除已退休的 contract/provider/binding/runtime source；不读取或覆盖 `.buildr/asset-review/`。builtin receipt 的既有 identity/legacy 语义保持不变，避免把两种资产回执模型混在一起。

## Risks / Trade-offs

- [Risk] migration 已提交但后续源资产 sync 失败，workspace 暂时处于“schema 已升级、源资产未完成”的状态 → migration 是向前兼容且幂等的；sync 返回失败并保留可重试路径，不回滚已成功的 schema migration。
- [Risk] legacy 白名单登记错误会接受不应退休的文件 → 只登记从产品 Git/package history 证明过的 hash，并增加未知 hash 零 mutation 测试和 package 格式校验。
- [Risk] 数据库被其他 writer 占用 → 复用 bounded busy timeout 与现有 `database-busy` diagnostic，不创建锁文件、租约或重试后台任务。

## Migration Plan

1. 发布包含本变更的 Buildr Product source/package。
2. 用户执行显式 workspace update 后运行 `buildr sync codex --target <workspace>`；sync 先 preflight，再应用 0005、0006，并完成 retirement/runtime reconcile。
3. 重复 sync 应报告 current/零 pending migration；若遇未知 contract hash 或 migration drift，保持阻塞并要求人工处理，不覆盖用户正文。

Rollback 只回退 Buildr 代码/package，不执行 down migration。已应用的 0005、0006 继续由后续兼容 runtime 读取；legacy 白名单撤回后，尚未退休的未知/不再接受 hash 会重新 fail closed，不会恢复已删除的受管源资产。

## Open Questions

无。已知历史 v1 hash 与当前 Jixian workspace 实际内容已由产品 Git history 和 live file hash 交叉确认。
