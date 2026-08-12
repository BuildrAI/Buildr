## Why

当前 runtime Skill 会把完整 workspace capability 路由图和 contract SHA-256 注入产品入口与 consumer 正文，导致机器证据挤占 Agent playbook，也让人难以判断真正需要执行的局部依赖。现在需要恢复“入口按意图路由、consumer 只读取自身依赖、完整诊断证据留在控制状态”的边界，使投射结果同时便于 Agent 正确执行和人类直接审阅。

## What Changes

- 产品入口 `buildr` 不再承载整个 workspace 的 consumer dependency graph；只保留自身明确使用的少量能力路由，并在需要时从当前 Doctor capability graph 解析 selected provider。
- 每个 consumer runtime Skill 只获得自身 `requires` 解析出的 capability binding，使用紧凑、可执行的 contract/provider 路径与 readiness 表达，不再在正文展示 contract SHA-256。
- 完整 capability graph、contract digest、binding provenance 和投射文件完整性继续由 Doctor JSON 与 `.buildr/agent-runtime/<destination>/<adapter>/skill-projection-ownership-receipts/` 承担；receipt 保持为未跟踪的 Buildr 控制状态。
- 补充结构化测试，验证产品入口无全局路由 dump、consumer 局部组合、blocked safety stop、Doctor 完整证据、receipt 路径与 Git ignore 边界。
- 在 `docs/architecture/` 新增 Buildr 技能体系架构文档，统一说明源技能、组件、内容增强、能力依赖、运行时投射以及 Doctor/receipt 的职责分层。
- 不包含破坏性 CLI 或源资产格式变更；现有 Skill、Component、contract、binding 与 receipt schema 保持兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-agent-skills`: 明确产品入口只暴露自身实际使用的按需能力路由，不接收完整 workspace consumer graph。
- `skill-capability-contracts`: 将 runtime binding evidence 收敛为 consumer-local、可读且可执行的最小信息，并把完整 digest/provenance 证据留给 Doctor 与投射 receipt。

## Impact

- runtime Skill 组合与投射：`src/infrastructure/runtime/skills/`、`src/infrastructure/runtime/projection.mjs`
- 产品入口 Buildr Skill：`package/targets/runtime/skills/buildr/SKILL.md`
- capability/Doctor/receipt 与静态校验测试
- Product OpenSpec specs 与 `docs/architecture/` 产品架构文档
- 当前 workspace 的最终 runtime sync、Doctor 与未跟踪 `.buildr` 控制状态
