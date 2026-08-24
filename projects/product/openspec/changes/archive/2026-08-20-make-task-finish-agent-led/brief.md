# Agent 主导的 Task 交付收敛

一句话摘要：Task Finish 后退为可选自动化与交付事实收敛入口，由 Agent 选择交付路径，Buildr 只验证结果边界并独立报告后续维护状态。

## 背景与问题

当前 Task Finish 把 Git 交付、内部运行证明、运行时激活、环境清理、诊断留存和 Task 终态绑成固定事务。多仓库部分交付后续跑时，一项 Buildr 内部证明漏写即可让已经成立的远端交付无法完成登记和清理；Agent 既不能据 Git 权威事实继续，也无法绕开 Buildr 自身缺陷恢复工作。

这违背 Buildr 的产品定位：Buildr 应该约束 Agent 不要做错事，而不是要求 Agent 必须通过 Buildr 才能做事。

## 目标与非目标

- 目标：允许 Agent 使用直接 Git、PR、现有 Finish 自动执行器或其他已授权路径完成交付。
- 目标：由 Buildr 从 current Development handoff、Task Contribution、目标身份和远端事实收敛逐仓库交付结果。
- 目标：把代码交付、运行时激活、Environment cleanup 和 diagnostics 拆成正交事实。
- 目标：保留目标与授权明确、不覆盖他人工作、远端包含任务贡献、资源 ownership 可证明等窄安全边界。
- 非目标：不为所有交付方式建立通用工作流 DAG，不替 Agent 判断语义冲突、合并策略或业务风险。
- 非目标：不允许调用方声明成功、手写 evidence、绕过 Git readback 或资源 ownership。

## 受影响角色

- Agent：选择和执行交付、冲突适配及技术恢复；根据独立 attention 继续处理激活、清理和诊断。
- 人：提供业务判断、授权和风险接受，不负责理解 Buildr 内部续跑与证明状态。
- Buildr：提供安全自动化、权威事实核验、结果登记和可恢复诊断，不垄断交付路径。

## 核心流程

1. Agent 根据任务和当前远端选择自动 Finish、直接 Git、PR 或其他已授权交付路径。
2. Buildr 按 repository 核对目标身份、current Task Contribution、真实远端 ref 与完整包含关系。
3. 全部适用 repository 的交付事实成立后，Task 提交 `completed/noChange=false`。
4. Buildr 独立投影 delivery、activation、environment cleanup 和 diagnostics；后三者的 attention 不撤销交付结论。
5. Agent 继续处理可恢复问题；只有真实风险对应的动作被阻止，例如远端未包含贡献、目标歧义、覆盖共享历史或无法证明安全删除。

## 关键变化

- 保留 `task finish run` 作为便利自动化，增加外部交付后的 delivery reconciliation。
- 自动路径与 reconciliation 复用同一逐仓库交付判断和 Task terminal 逻辑。
- 多仓库 relation 与 proof 原子写入；远端仍等于 carrier 时保持 `carrier`，远端后继包含贡献时才登记 `already-contained`。
- execution record、Doctor、activation 或 cleanup 失败只形成对应 attention，不再否定已成立的代码交付。
- Task Environment cleanup 消费可复算 delivery evidence，仍独占资源删除 authority，但不拥有 Task 交付结论。

## 影响、风险与兼容性

旧消费者可能把 `complete` 等同于全部清理完成，因此新增正交 maintenance projection并兼容读取现有 Finish current/completion。历史缺失 proof 尽量从远端和 Task Contribution 重建；无法重建时只把对应 repository 标记为 `unproven`。已交付但尚未清理的 Environment 可能继续占用资源，Buildr 必须明确报告 owner 与 Agent next action，资源冲突仍由 Environment prepare 阻止。

## 验收摘要

- 多仓库部分交付后续跑不会因 relation/proof 不一致阻止结果收敛。
- Agent 外部推送或 PR 合并后，Buildr 能独立观察并登记交付，不接受 claimed success。
- Doctor、activation、cleanup 和 Finish diagnostics 失败不会撤销 Task 已交付状态。
- 无法证明远端包含贡献、目标身份或删除 ownership 时，只阻止对应危险动作并给出精确 next action。
- 旧 blocked/cleanup-pending run 可读取、重建或诚实保留为 unproven。

## 技术入口

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/task-record/spec.md`
- `specs/task-environments/spec.md`
- `specs/task-execution-artifacts/spec.md`
- `specs/task-closeout-orchestration/spec.md`
- `tasks.md`
