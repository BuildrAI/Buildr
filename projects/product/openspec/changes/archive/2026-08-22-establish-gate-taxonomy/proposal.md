## Why

Buildr 已在 Core 与路线图中采用“宽而薄”的治理，但产品各模块仍混用 `ready`、`blocked`、`required`、`fail closed` 与全局 health，缺少统一标准说明某个缺口究竟应阻止当前动作、形成待处理事项，还是仅作为建议。这会让内部登记或局部能力问题被误当成 Agent 的通用工作许可，也让后续 Finish、Environment、Development 与 Doctor 重构缺少共同判断基线。

## What Changes

- 建立产品级门禁分类契约，区分硬门禁（Hard Gate）、待处理（Attention）、建议（Advice）与动作局部就绪（Action-local Readiness）。
- 要求每个新增或保留的硬门禁明确具体动作、消费方、结果不变量、放行伤害、判断 authority、阻塞范围和安全降级。
- 形成当前 `ready`、`blocked`、`required`、`fail closed` 与全局 health 产生/消费点的有界审计清单，标注后续模块 owner；该清单不是运行时 registry 或第二套进度 authority。
- 用 Task Entry、Formal Verification preparation 与 Task Finish 三类现有代表性路径形成基础反例证明：局部缺口只阻止其消费动作，无关工作继续，身份、授权、证据真实性和危险副作用仍然硬阻断。
- 更新产品架构与当前认知，使后续 Contributions 能复用同一分类模板；不在本 Change 中批量迁移全部 Application、Skill、CLI 或 Buildr Web。
- 不包含破坏性 API 或数据迁移。

## Capabilities

### New Capabilities

- `governance-gate-taxonomy`: 定义 Buildr 产品硬门禁、待处理与建议的统一分类，约束动作局部作用域、硬门禁八字段记录、安全降级、有界审计清单及代表性基础证明，并明确它们不得成为全局工作许可或第二套运行时 authority。

### Modified Capabilities

无。

## Impact

- 影响 Product OpenSpec、产品架构/current knowledge、门禁审计文档与代表性测试。
- 不新增全局 gate registry、生命周期状态、SQLite 存储或通用运行时状态机。
- 不改变现有公开 CLI/HTTP JSON schema；各模块的全面迁移分别由后续 Contribution 负责。
