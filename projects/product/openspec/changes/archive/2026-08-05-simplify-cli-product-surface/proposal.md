## Why

Buildr 当前以独立硬编码维护 CLI dispatch、根帮助、主题帮助、产品表面分类和验证清单，已经出现“路由仍可执行但没有帮助主题”以及规范要求的聚合帮助不可用等漂移。与此同时，两个已被单一 OpenSpec 收敛事务取代、且没有当前 Skill/Component 消费者的分阶段入口仍被当作受支持命令保留，扩大了兼容面和维护成本。

## What Changes

- 建立单一 CLI command metadata authority，统一声明 command key、产品表面层级、帮助主题、执行 adapter 和兼容状态，并由同一事实生成 dispatch、帮助发现和表面一致性验证。
- 将命令表面明确划分为 `primary`、`agent-machine`、`maintenance`、`legacy`，保持必要 Agent 机器接口可调用，但不把开发维护或兼容入口混入普通用户主路径。
- 修复已注册命令与主题帮助的一致性，包括补齐 `task finish` 聚合帮助并保证每个 retained route 都可查询 canonical help。
- **BREAKING**：删除没有当前消费者的 `buildr openspec sync-plan` 与 `buildr openspec sync-apply` 路由、帮助/JSON surface 和对应 legacy Application handlers；确定性规划与应用继续只由 `buildr openspec converge` 的单一事务内部持有。
- 保留 `openspec baseline create`、阶段型 `openspec check` 与 `skills migrate-project-assets` 为显式 `legacy`，记录 replacement 和后续退役边界；本 Change 不提前删除仍有消费者的兼容能力。
- 同步公开 CLI 文档、OpenSpec 规范和验证，使新增、保留、迁移或删除命令时只修改一份 command authority。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-product-surface`: 统一命令表面 authority 与层级，保证 route/help/verification 一致，并删除两个零消费者的 legacy OpenSpec 分阶段入口。

## Impact

- 影响 `src/interfaces/cli/registry.mjs`、`src/interfaces/cli/help.mjs` 及其新的 command metadata owner。
- 影响 legacy OpenSpec CLI handlers、公开 JSON schema 清单和对应测试/验证。
- 影响 CLI Reference、内部架构说明、Buildr Product current knowledge 与 `cli-product-surface` canonical spec。
- 不改变 Rules、Skills、Commands、Components、Task、Verification、Environment 或 Finish 功能模块的领域语义；保留命令的参数、effects 与 JSON contract 除明确删除项外保持兼容。
