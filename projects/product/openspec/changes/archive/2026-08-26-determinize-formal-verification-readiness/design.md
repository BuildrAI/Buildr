## Context

当前 Verification Plan 已能在正式执行前投影完整 preparation closure，Task Verification 也已经禁止同一 exact invocation 静默重复执行。但 Task Development 的 `discover policy` 只按 declaration 的 `usableFor: task-delivery` 全选默认能力，`task next` 也先引导 policy/freeze，无法消费真实 Plan selection。这使 Plan 的 direct/dependency/full 选择和未选择能力不能成为 policy 的确定性输入。

## Goals / Non-Goals

**Goals:**

- 让 Task Verification Application 只读校验一组 current closed Plan，并投影 Task Development 可直接记录的 policy 输入。
- 让 Task Development 在 Content Target current、policy missing 时优先引导 `plan-and-derive-policy`，然后才 freeze。
- 让内部 driver 能从临时 Plan 文件安全装配 discovery 输入，避免智能体手抄大 JSON。
- 明确 selected、not-selected、coverage gap、target 和 declaration 的可验证边界。

**Non-Goals:**

- 不把 Formal Plan 或 preparation 状态写入 Development Receipt、Verification Result 或新 store。
- 不自动调用 Environment prepare、policy writer、freeze 或 verification run。
- 不改变 Candidate identity、Verification Result schema、Execution Record identity或HTTP契约。
- 不以该工作流禁止智能体在既有授权下直接开发或执行有界非正式反馈。

## Decisions

1. **Plan→policy 投影由 Task Verification Application 拥有。** 它已经拥有 declaration 解析和 Plan 语义，因此负责校验 Plan document 的闭合 identity、task-delivery target、current Content Target、Project/declaration、selected capability 与完整 Project 覆盖。Task Development 只消费投影，不自行解释 Plan。

2. **投影保持只读、瞬态。** 输出包含现有 policy writer 所需的 `capabilities`、`coverageGaps`、`overrides`，并附带 response-only `notSelectedCapabilities` 与 Plan identities。这样不迁移 Development Receipt，也不让 Plan 成为第二份 lifecycle authority。

3. **内部 driver 使用重复 `--plan <project>::<file>`。** runner 只读取普通 JSON 文件并注入 closed discovery input；Application 再做完整语义校验。Plan 文件继续由 Verification workflow 管理和清理，driver 不保存路径或正文。

4. **保留声明默认降级。** 没有 `--plan` 时，既有 `discover policy` 仍按 declaration 生成默认输入。`task next` 和 Skill 将 Plan-first 作为正式验证的推荐路径，但不把它扩成普通工作的强制许可层。

5. **证据复用不增加新缓存。** stable target 下同一 Plan 文件直接交给后续 formal run；Execution Record 继续按现有 invocation identity 阻止重复执行。target、declaration或capability集合变化时重新形成 Plan。

## Risks / Trade-offs

- [Risk] 多 Project Task 缺少任一 Project Plan时产生不完整 policy。→ 投影要求 Project 集合精确覆盖并零写入失败。
- [Risk] Agent 传入被修改或陈旧 Plan。→ 重新验证 closed identity、target、declaration和当前能力。
- [Risk] 推荐顺序被误解为自动编排或硬门禁。→ Application只读投影，`task next`保持 recommended，Skill明确保留直接路径与Agent判断。
- [Trade-off] not-selected disposition不进入Receipt。→ 避免无必要schema迁移；current declaration与selected policy可确定性重建该摘要。

## Migration Plan

- 新增只读 Application method、driver参数和Skill引导；旧调用方不传Plan时行为不变。
- 同步 builtin source、packaged runtime assets、静态检查与专项测试。
- 通过现有 self-bootstrap 激活 delivered workspace；失败只形成 Activation attention，不改变Delivery。

## Open Questions

无。
