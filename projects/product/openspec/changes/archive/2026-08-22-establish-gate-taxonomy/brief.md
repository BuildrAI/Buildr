# 建立 Buildr 门禁分类与动作局部就绪

## 一句话摘要

统一 Buildr 对硬门禁、待处理、建议和动作局部就绪的判断，使产品只阻止会破坏真实结果不变量的具体动作。

## 背景与问题

Core 与智能体优先治理路线图已经明确宽而薄的治理方向，但现有模块仍分散使用 `ready`、`blocked`、`required`、`fail closed` 和聚合 health。缺少共同分类时，内部登记或局部能力问题可能被误当成 Agent 的通用工作许可，后续模块重构也无法使用一致的验收语言。

## 目标与非目标

目标是形成 canonical 分类契约、有界审计清单和真实模块的代表性反例证明，并为后续 Finish、Environment、Development、Doctor 等 Contributions 提供迁移输入。

非目标是新增全局 gate registry、生命周期状态或统一运行时 evaluator，也不在本 Change 中批量迁移全部模块。

## 受影响用户或角色

- Agent：能够区分必须停止、可以继续但需报告、以及纯推荐路径。
- 人：只需理解目标、结果、风险和必要授权，不承担 Buildr 内部恢复细节。
- Buildr 产品维护者：后续模块设计和审查使用统一门禁模板。

## 核心流程

产品设计或审查一个门禁时，先确定具体 action 与 consumer，再说明 invariant、harm、authority、scope 和 fallback，最后分类为 blocked、attention 或 advice。无法说明具体伤害的规则不得成为硬门禁；局部缺口不得阻止不消费该事实的动作。

## 关键变化

- 新增 `governance-gate-taxonomy` canonical capability。
- 新增门禁审计与后续 owner 映射。
- 强化 Task Entry、Formal Verification preparation 和 Task Finish 的代表性测试。
- 更新产品架构、技术架构和 glossary。

## 影响、风险与兼容性

本 Change 不改变公开 CLI/HTTP JSON schema，不迁移持久数据。主要风险是分类文档与实现漂移，因此规范保持行为 authority，审计清单只作为当前迁移输入，全面迁移由后续 Contributions 分域完成。

## 验收摘要

- 每项硬门禁能够回答八字段模板。
- 内部登记或局部能力缺口不会被扩大为全局工作许可。
- 身份、授权、证据真实性和危险副作用仍硬阻断。
- 代表性测试断言结果不变量，而非固定流程措辞。

## 技术 Artifacts 入口

- `proposal.md`
- `design.md`
- `specs/governance-gate-taxonomy/spec.md`
- `tasks.md`
