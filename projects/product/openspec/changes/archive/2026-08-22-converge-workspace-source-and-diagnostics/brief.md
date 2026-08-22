# Workspace 来源模型与局部诊断

一句话摘要：Buildr 保留 Workspace 内默认受管布局，同时允许用户明确附接已有外部 Git Project/Service，并让 Doctor、Capability、Component 与 sync 只按当前动作和 ownership unit 消费诊断。

## 背景与问题

当前 Project/Service source 与固定 `projects/<code>`、`services/<code>` 路径耦合，已有外部仓库必须复制或搬入 Workspace 才能成为正式来源；Doctor 的聚合 readiness 又容易被消费方扩大为所有工作的许可。这与“约束真实风险，而不是强制所有工作通过 Buildr”的 Core Rule 不一致。

## 目标与非目标

目标是增加 Managed Root/Attached Root、兼容来源身份和统一 resolver；允许显式 attach 但不接管外部内容；为 finding 增加 domain、action 与 ownership unit，并让可分离局部冲突不阻止无关 action。

不支持非 Git Attached Root，不自动 clone/copy/move/adopt/delete 外部仓库，不建立第二 registry 或全局 health authority，也不削弱 required Core、identity、path、integrity、shared transaction 与安全删除边界。

## 受影响用户或角色

直接受益者是管理多个既有仓库的用户与 Agent；Buildr Product/Workspace owner、Doctor consumer、Capability/Component/sync owner 需要改用明确 source 与局部 finding contract。

## 核心流程

用户明确选择外部 Git root后，Agent调用 attach；Buildr 只读核对 top-level、remote、branch 与重复 realpath，再写 registry relation。后续 inspect/Doctor通过 resolver观察该root；依赖它的 mutation在identity或ownership不可证明时局部fail closed，其他Project/Service和ownership unit继续工作。

## 关键变化

- v2 source兼容扩展`root: attached`，缺失继续解释为managed。
- Project/Service统一解析实际root，Service registry跟随Project root。
- Doctor输出domain health与affected actions，总体health不再表示通用许可。
- sync、Capability、Component按consumer action与ownership unit处理finding。

## 影响、风险与兼容性

旧managed manifests保持兼容。Attached Root绝对path具有机器局部性，跨机器不可访问时只报告该source unavailable，不自动改写。旧consumer直接拼路径是主要迁移风险，通过静态审计、focused tests与显式managed-only guard控制。

## 验收摘要

真实外部Git Project/Service可附接且内容、branch、remote零变化；managed layout继续工作；一个Attached Root或optional Runtime/Component冲突不阻止无关action；required Core、identity/path/integrity/shared transaction/delete ownership仍硬阻断；Doctor JSON可明确解释哪个domain、action和ownership unit受影响。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [Delta specs](specs/)
