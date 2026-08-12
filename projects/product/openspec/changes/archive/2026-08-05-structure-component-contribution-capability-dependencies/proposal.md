## Why

Component-owned Skill Contribution 可以为目标 Skill 增加新的硬停止条件，但当前 Component schema 只能声明 Markdown fragment，capability graph 仍只读取目标 Skill manifest 的 `requires`。这会让 fragment、package builtin descriptor 与 Doctor graph 形成多份需要人工同步的 authority，并允许 consumer 在 provider 不可用时仍被报告为 ready。

OpenSpec Component 同时保留了旧 `task-triage#change-ready`、独立 sync/archive 入口和新的单一 `buildr openspec converge` 事务，导致当前运行时虽然结构合法，但 apply、sync 与 archive 的真实停止边界不一致。

## What Changes

- 扩展 Component v1 Contribution schema，使 Component 可以为自己贡献 fragment 的目标 Skill 声明结构化 capability dependencies。
- 在运行时解析阶段把 base Skill `requires` 与已安装 Component 的 dependency contributions 确定性合并；Component install、update、uninstall 通过同一 Component definition 原子增删 fragment 与依赖，不修改目标 Skill 源正文。
- 校验 dependency target、capability identity、version、mode、重复和冲突；Doctor 继续只消费结构化依赖，不从 Markdown 推断 capability。
- 将 OpenSpec propose/apply 的 Task Record、Environment、Development 与 current knowledge 硬依赖移入 OpenSpec Component definition；update 的 Environment/Development 保持 optional 条件依赖。
- 移除 `task-triage#change-ready`；在 apply prepend 执行 apply-ready、upstream strict validation 与 proposal/delta check。
- 为 sync/archive 增加 prepend，拒绝独立 canonical sync 或 archive，并转交单一 `buildr openspec converge`；它们不机械声明整套 Task dependencies。
- 收敛 canonical specs 中旧 baseline、pre-sync/post-sync 和 Task Finish convergence 条款，保留 `converge` 作为唯一确定性 canonical sync/archive authority。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `managed-components`: Component Contribution 可以声明并原子维护目标 Skill 的结构化 capability dependencies。
- `skill-capability-contracts`: capability graph 合并 base consumer dependencies 与已安装 Component dependency contributions，并保持确定性诊断语义。
- `agent-task-workflows`: OpenSpec propose、update、apply、sync、archive 的直接与条件依赖及 convergence 边界统一。
- `buildr-package-assets`: 随包 OpenSpec Component、builtin descriptors、静态验证和自举同步必须交付一致的新 schema 与 runtime 行为。

## Impact

- Component definition parser、validator、package reconciliation、runtime Skill resolution 与 capability graph 输入。
- Component contract/runtime/system tests 和 package static validation。
- OpenSpec Component contributions、package builtin descriptors、workspace target manifests 与 integrity。
- canonical OpenSpec workflow、capability contracts说明和 Buildr current knowledge。
- Component schema 新字段是向后兼容扩展；既有只包含 `skillFragments` 的 Component 继续有效。
