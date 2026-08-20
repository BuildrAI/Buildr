## Context

Task Finish 当前把 Development handoff、Delivery Carrier、Git target transition、remote readback、retained activation、Doctor、Environment cleanup、transient cleanup、execution record 和 Task Record terminal transition绑定为一个固定五阶段 run。该模型能自动完成常见路径，但也把产品内部实现变成唯一合法交付路径：任一内部证据、record、Doctor 或 cleanup 缺口都会阻止 Buildr承认远端已经成立的交付事实。

本次设计遵守 Buildr Core：智能体负责理解、推理和执行；Buildr 只保护会造成越权、错误对象写入、未经授权或不可逆副作用、证据失真、完成误报及覆盖他人工作的少量边界。

## Goals / Non-Goals

**Goals:**

- 让 Agent 可以选择直接 Git、PR、现有 Finish 自动执行器或其他已授权交付路径。
- 建立单一交付收敛器，依据 Development handoff、Task Contribution 和远端权威事实判断逐仓库交付结果。
- 把代码交付、运行时激活、Environment cleanup 和诊断留存拆成正交事实。
- 保持远端目标、授权、贡献包含关系和资源 ownership 的窄硬边界。
- 兼容并修复现有 multi-repository blocked/cleanup_pending run。

**Non-Goals:**

- 不为所有 Git/PR/release/deploy 方式预建通用 adapter registry 或工作流 DAG。
- 不让 Buildr 判断语义冲突、替代 Agent 选择合并策略或接受业务风险。
- 不允许 Agent 手写 SQLite、伪造 Task Contribution、声明未经观察的远端结果或绕过资源 ownership。
- 不在本 Change 中进行 Buildr Web 视觉改版。

## Decisions

### 1. Finish 从唯一执行器改为双入口

保留 `task finish run` 作为便利自动化，但它不再拥有独占 authority。新增 `task finish reconcile` 产品语义：调用方提供 Task 与明确目标选择，Buildr 从 current Development handoff、Environment repository set 和远端读取最终事实，形成同一 delivery result。

选择这一方案而不是删除自动 Finish，是因为常见 clean fast-forward 路径仍值得自动化；选择 reconciliation 而不是允许 Agent 写 outcome，是因为远端包含关系仍应由 Buildr 独立验证。

### 2. 结果不变量代替固定过程

每个 applicable repository 的交付结果只要求：selector/retained root/remote/target branch identity明确、current Task Contribution identity明确、真实远端 ref 可读、目标完整包含贡献。结果记录 `carrier` 或 `contained` 关系、最终 ref 和可重建证明，但不要求存在 Finish run、Delivery Carrier、固定提交信息或同一恢复令牌。

自动 run 内部仍可使用 `preflight/prepare/verify/deliver/cleanup`，这些阶段降为 provider 实现和诊断，不再定义 Agent 的唯一执行路径。

### 3. Task 交付终态与后续维护分离

全部 applicable repositories 具有 current delivery evidence 后，Task Record Application即可提交 `completed/noChange=false`。Finish/terminal projection另外报告：

- `delivery: delivered|unproven`
- `activation: passed|not-applicable|attention`
- `environmentCleanup: cleaned|pending|attention`
- `diagnostics: retained|attention|not-opened`

Doctor 或 cleanup attention 不得撤销已成立的交付；它们由 Agent继续处理。无法证明安全删除时仍不得删除对应资源。

### 4. 交付证明可重建且原子收敛

交付 relation 与证明必须作为一个完整对象写入。远端等于 carrier ref 时保持 `carrier`，不生成伪 `already-contained`；远端后继完整保持 Task Contribution changed paths 时写 `already-contained` 与完整 containment proof。历史缺失证明由 reconciliation 重算，不能重算时只把该 repository 标为 unproven。

### 5. Environment cleanup 接受交付证据而非 Finish 路径证明

Task Environment继续是资源 cleanup 唯一 owner，但 cleanup authorization 改为消费逐仓库 delivery evidence 与可独立复算的 Task Contribution proof。它不要求证据必须来自同一 Finish run，也不改变 Task 交付状态。cleanup blocked只保留当前资源和 Agent next action。

### 6. Execution Record 降级为可观测性

Finish producer仍尝试打开独立 diagnostics record。容量、seal 或 cleanup失败只形成 `attention`；自动执行和 reconciliation 继续保存最小 inline failure/delivery facts。该变化不影响 Formal Verification producer，Verification仍可按自己的契约保持 execution record gate。

### 7. 自举激活独立消费交付事实

`buildr-self-bootstrap-sync` 根据 matching Task delivery result 与 frozen Task Contribution paths启动，不再要求 Formal Finish 已 complete 或只处于 retained Doctor blocked。Runner仍验证目标、Node、development entry和自身副作用，但失败只形成 activation attention，不改写 Task 已交付终态。

## Risks / Trade-offs

- [旧消费者把 `complete` 等同于 cleanup 完成] → 提供 additive maintenance projection并更新 CLI/Web/Skill；旧 complete row继续兼容读取。
- [Agent 外部交付后目标选择错误] → reconciliation要求明确 repository/remote/branch binding并从 current Environment/Project facts核对，歧义时只阻止登记。
- [交付成立但遗留 worktree 占用资源] → Environment保留独立 cleanup attention和精确 owner，不阻塞无关Task，但相同资源冲突仍在Environment prepare处阻断。
- [自动 Finish 与外部 reconciliation 竞争] → 同一Task/target使用短 mutation lease；reconciliation只读远端后以Task/target identity幂等写入，不接管正在发生的push。
- [规范面过大] → 不引入通用adapter/DAG，只增加最小reconciliation port并复用现有Task Contribution和containment算法。

## Migration Plan

1. 增加新的 delivery/maintenance read model和兼容投影。
2. 修复现有多仓库续跑 relation/proof 原子写入。
3. 增加 reconciliation Application/CLI，并让自动 run 的交付终态复用它。
4. 调整 Task terminal、Environment cleanup和execution record producer语义。
5. 更新self-bootstrap consumer和Skills。
6. 对旧current run：`finalRemoteRef == carrierRef`恢复为carrier；否则重算containment；无法重建时保留unproven而不覆盖远端事实。

回滚时可恢复旧CLI读取器，但不得删除新版本已经保存的交付事实；旧运行时遇到新schema必须明确报告版本不支持，不能迁移回旧语义。

## Open Questions

- 无。当前决定足以进入实现；具体CLI参数保持最小并以现有Environment repository selector模型为准。
