# 闭合 Task 验证与交付内容完整性

## 一句话摘要

在现有 Fast admission 与 Agent-led Delivery Adaptation 内补齐内容集合证明，提前阻止 HTTP contract fixture 漂移，并避免部分 carrier 被误报为完整 Task 交付。

## 背景与问题

Buildr 已把低成本 Fast steps 放在本地 affected/full 重型步骤之前，也允许 Agent 在隔离 Delivery Carrier 中处理目标分支冲突。当前缺口不是流程缺失，而是内容集合没有闭合：Fresh Build fixture 的 HTTP contract/generator/DTO 文件由手工列表复制；Agent-reviewed carrier 只证明自身差异稳定，未逐项说明原 Task Contribution 的全部路径。

## 目标 / 非目标

目标是让 HTTP contract 内容闭合错误在现有 Fast admission 中失败，并让 Delivery Adaptation 对每个 Task Contribution 路径形成机器可核对或 Agent 显式负责的处置。

本次不建立语义等价算法，不把 Buildr 变成通用许可层，不新增 lifecycle store、自动重试或正式 Verification runtime 的 deadline/进程治理。

## 受影响用户或角色

- Agent：只对不能由 target/carrier 自动证明的路径提交逐路径语义判断，并继续拥有 PR、直接 Git 或 carrier 修订选择。
- Buildr 维护者：在 Fast admission 阶段收到 HTTP contract fixture 缺失诊断，不必等待 Fresh Build System 失败。
- Task Finish：只保护 Task Contribution 路径闭合、Git identity 与交付证据，不接管语义判断。

## 核心流程

1. Product changed/candidate plan组合同一 Fast admission，Contract/Static owner校验 HTTP contract inventory 与两端 DTO 输出。
2. Fast 通过后，原 affected/full DAG继续；Fresh Build System 从同一 inventory 构造最小真实 fixture。
3. Delivery Adaptation adoption对每个 Task Contribution 路径分类为 target精确包含、carrier实际改变或 Agent显式确认目标语义承接。
4. 覆盖不完整时保持同一run/carrier blocked；Agent修订carrier、补充逐路径判断或选择其他合法交付方式。
5. deliver、remote readback 与 cleanup重验同一coverage identity，禁止旧proof在漂移后继续成立。

## 关键变化

- 新增测试侧 HTTP contract Fresh Build inventory 与 Fast owner。
- 新增 Agent-reviewed Delivery Adaptation 的逐路径覆盖 value、identity 和 compact diagnostic。
- 旧 proof 只读兼容；不新增数据库表、Task状态或跨run cache。

## 影响 / 风险 / 兼容性

路径自动覆盖失败时，Agent需要对少量路径明确说明语义判断，增加有限输入成本；换取的是消除静默遗漏。旧 Finish Result 不回填，新 run使用新proof。外部Git/PR仍合法，但最终reconciliation必须从真实remote证明交付。

## 验收摘要

- 新增 HTTP contract/generator/DTO 未进入 fixture inventory 时，Fast admission在重型step前失败。
- 35路径只交付2路径的carrier不能adopt、deliver、complete或cleanup。
- exact target、carrier change与逐路径Agent review共同形成closed coverage；Buildr不声称机器证明语义等价。
- 没有新增正式 Verification runtime、数据库或通用状态机语义。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Product verification quality delta](specs/product-verification-quality/spec.md)
- [Task closeout orchestration delta](specs/task-closeout-orchestration/spec.md)
- [Implementation tasks](tasks.md)
