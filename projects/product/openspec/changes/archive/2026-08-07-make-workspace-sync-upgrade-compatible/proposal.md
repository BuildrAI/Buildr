## Why

已有用户 workspace 的 SQLite structured store 可能停留在 migration 0004，而当前 Buildr 已交付 0005、0006；现在 sync 只在业务写入时迁移，导致用户更新 workspace 时被 Doctor 阻塞。与此同时，Task Asset Review 退休声明只接受当前 contract hash，历史同步得到的官方 v1 contract 因产品正文后续澄清而被误判为用户篡改，阻断了本应安全完成的退休同步。

本变更让显式 workspace sync 在完成只读 preflight 后自动升级本地 SQLite，并允许退休声明接受明确登记的历史官方 hash；未知 hash 仍然 fail closed。该变更不删除用户历史 observation 数据，也不改变 SQLite 的单机边界。

## What Changes

- 在 sync 的受管源资产写入前，使用 retained Buildr runtime 对用户 workspace 的 SQLite structured store 应用所有 pending migrations；migration 失败时不开始源资产 mutation。
- 为 capability retirement 增加明确的历史官方 SHA-256 完整性白名单，并让 package check 校验其格式、唯一性和来源约束。
- 将已知历史 `task-asset-review/v1.md` hash 登记为可安全退休的 legacy integrity；未知或用户修改后的 hash 继续阻塞 sync，保持零源资产写入。
- 增加 SQLite sync upgrade、历史 hash retirement、未知 drift fail-closed 和重复 sync 幂等性回归验证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-structured-data-store`: 显式 workspace sync MUST 能在源资产 mutation 前应用 pending SQLite migrations，并保持 migration 原子性、provenance 和失败保护。
- `buildr-package-assets`: capability retirement MUST 支持受管、可审计的历史官方 contract hash，同时继续拒绝未知 drift。

## Impact

- 影响 `services/buildr` 的 sync orchestration、SQLite migration application、capability retirement、package manifest validation 及其 system/integration tests。
- 用户 workspace 的 `.buildr/local/workspace.sqlite` 会在成功 sync 前升级到当前 schema；`.buildr/asset-review/` 与其他用户正文不在变更范围内。
- 不新增依赖，不执行 down migration，不允许候选 runtime 写入 retained canonical store。
