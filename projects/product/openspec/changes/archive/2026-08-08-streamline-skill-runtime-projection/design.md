## Context

Buildr 当前有两条 Skill 来源路径：package 直接提供产品入口 `buildr`，workspace registry 提供其余本地、builtin 与外部 Component 成员；两者最终共用同一套 runtime render。Component 可以通过 Skill Contribution 改变目标正文，也可以通过 dependency contribution 增加结构化 `requires`。

现有 renderer 在正确的 consumer-local binding 之外，又把所有 scope、consumer、binding 和 contract digest 展开成 `Workspace routing evidence` 注入产品入口。consumer binding 本身也逐字段展示 SHA-256 与 provenance。结果是诊断数据侵入 playbook：产品入口像全局 dispatcher，局部 Skill 正文被机器字段放大，人无法快速分辨执行路径，Agent 也为无关依赖消耗上下文。

现有 Doctor full JSON 已能输出完整 capability graph、contract digest、binding provenance 和 readiness；Skill projection ownership receipt 也已经位于 destination-aware 的 `.buildr/agent-runtime/` 控制状态根，并由根 `.gitignore` 排除。因此本次不需要新增全局存储，只需要把现有证据放回正确表面。

## Goals / Non-Goals

**Goals:**

- runtime `SKILL.md` 优先表达可执行 playbook，让人能直接阅读，让 Agent 只加载当前 Skill 所需依赖。
- 产品入口只保留自己明确支持的内部路由，不承载或复制整个 workspace consumer graph。
- consumer binding 保留 capability identity、contract/provider 路径、mode、readiness、reason 与安全停止条件，但不显示 SHA-256 和完整 provenance。
- Doctor full JSON 保持完整全局图；每个 consumer 的 projection receipt 保存该次局部 binding 的完整 digest/provenance 快照。
- 兼容现有 Skill、Component、contract、binding、adapter 和 v2 receipt。

**Non-Goals:**

- 不重做 capability resolution、provider selection 或 Skill description 的首次意图发现机制。
- 不建立新的 routing registry、缓存、dispatch CLI 或 Project Skill source。
- 不在本 Change 中处理中性化全部外部 OpenSpec 宿主语法，也不重构 Contribution 内容。
- 不把 Doctor compact JSON 扩大为默认完整 inventory。

## Decisions

### 1. 产品入口不再注入全局 routing evidence

删除 projection assembly 对 `resolveCapabilityRoutingEvidence` 的调用以及 renderer 中的 `Workspace routing evidence` 分支。产品入口源 Skill 已经拥有自己实际支持的少量意图与 capability identity；当某个意图命中后，Agent 通过当前 scope 的 Doctor full capability graph 解析该项 selected provider。

这样不需要再声明一份产品路由数据源，也不会把 Buildr 伪装成所有 Skill 的前置 dispatcher。曾考虑保留一份压缩后的全局表，但它仍会重复 consumer graph、产生 scope 噪音并随 workspace 增长，因此不采用。

### 2. consumer runtime block 使用紧凑的局部执行视图

每个 consumer 仍由 `capabilityBindingsForSkill` 取得自身 `requires`，renderer 只输出：consumer readiness；每项 dependency 的 identity、mode、readiness/reason、contract path、selected provider 与 runtime path/scope；以及执行前读取 contract/provider 或 blocked safety stop。

SHA-256、候选 providers、完整 provenance 和 nextActions 不属于日常 playbook，移出 `SKILL.md`。曾考虑完全移除 binding block、要求 Agent 每次调用 Doctor，但这会丢失 consumer 加载后的确定性局部入口和 fail-closed 指引，因此保留最小 block。

### 3. Doctor 与 receipt 分别承担全局和局部机器证据

Doctor `--detail full` 继续作为当前 workspace 完整 capability graph 的只读事实入口，包含 contracts、digests、bindings、consumers 与依赖诊断。默认 compact Doctor 仍只返回健康和动作摘要。

新生成的 consumer projection receipt 在现有 v2 identity、source/render digest 与文件 inventory 之外，增加可选 `capabilityBindings` 快照及独立完整性字段。快照记录 runtime 正文省略的 contract digest、binding provenance 和 resolved dependency 细节；非 consumer receipt 不写空字段。旧 v2 receipt 没有该字段时仍可读取，下一次适用 render 自然补齐，不做单独迁移。

这使 contract 澄清可以只更新 `.buildr` receipt/Doctor 证据，而不为相同执行路径改写 runtime playbook。曾考虑创建独立全局 capability receipt，但 Doctor 已经是全局图的 current read model，新建第二份全局 authority 会造成重复，故不采用。

### 4. receipt 保持本地控制状态

workspace destination receipt 继续写入 `<workspace>/.buildr/agent-runtime/workspace/<adapter>/skill-projection-ownership-receipts/`；user destination receipt 继续写入 `<user-home>/.buildr/agent-runtime/user/<adapter>/...`。不把 receipt 复制到 runtime Skill 目录，也不把它变成源资产或 Git 交付物。测试将固定 canonical path 与根 `.gitignore` 的覆盖关系。

### 5. 文档使用统一五层术语

架构文档以“源技能、组件、内容增强、能力依赖、运行时投射”为主要对外术语；只有在解释能力替换和诊断时展开 contract、provider、consumer、binding。文档明确产品入口是唯一特殊来源，但不是第三套 renderer，也不是全局 dispatcher。

## Risks / Trade-offs

- [产品入口不再携带 selected provider 快照，执行时可能多一次 Doctor full 查询] → 只在命中的少量产品内部路由需要 provider 时查询；普通 Skill 首次发现和 consumer-local 执行不受影响。
- [旧 runtime Skill 在重新 render 前仍含全局 dump] → `sync`、`render` 和 `skill install` 共用计划/reconcile，升级后的首次适用操作会确定性替换受管副本。
- [receipt 增加可选字段后旧 CLI 不理解新证据] → v2 schema 保持向后兼容；旧解析器允许额外字段，新解析器接受字段缺失并在下一次 render 补齐。
- [过度压缩 binding 导致 Agent 缺少修复信息] → runtime 保留 reason 与 safety stop，详细 candidates/nextActions 由 Doctor full graph 提供。
- [只做结构测试仍可能产生难读文本] → 增加正向可读格式断言和反向禁止全局 routing/SHA-256 注入的测试，并在架构文档中声明表面职责。

## Migration Plan

1. 先更新 delta specs、renderer、receipt 和产品入口源 Skill，并运行聚焦测试。
2. 在隔离 validation workspace 对全部 supported adapters render，验证 runtime 内容、receipt 与 Doctor full graph。
3. 完成 Product Candidate 验证、OpenSpec converge/archive 与 Task Finish。
4. 从保留的产品 checkout 对自举 workspace 执行当前 Agent sync，使 `.agents/skills/` 与 `.buildr/agent-runtime/` 收敛。
5. 若出现回归，回退产品提交并重新 sync；旧 v2 receipt 仍可被回退版本读取，不需要数据降级。

## Open Questions

无。用户已确认 runtime 可读性、consumer-local binding、产品入口边界和 receipt 本地控制状态原则。
