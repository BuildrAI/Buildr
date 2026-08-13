# 修复 Task Finish compact 输出投影

## 一句话摘要

让 `task finish run|inspect` 的 compact/full 公开 JSON 契约真正生效：普通 Agent 默认读取可恢复的最小结果，诊断和 self-bootstrap 继续显式读取完整 v2 Result。

## 背景与问题

CLI 已接受 `--detail compact|full`，但 Application 始终序列化完整 Result。两种模式逐字相同，Agent 为判断状态、失败或恢复动作仍需消费数百行输出，且公开帮助与实际行为漂移。

## 目标与非目标

目标是增加 closed compact schema、保留完整 full schema、闭合 detail 校验，并用典型终态和恢复场景证明 compact 不丢失关键事实。非目标是改变 Task Finish 五阶段、SQLite、Execution Record、resume、Delivery Carrier、Environment cleanup 或其他 CLI read model。

## 受影响角色

- Agent：默认获得低体积、可行动的 Finish 结果。
- Buildr 维护者：通过 full Result 和 Execution Record 保留完整诊断。
- self-bootstrap runner：继续显式使用 `--detail full`，输入不变。

## 核心流程

Task Finish 先生成 canonical `buildr.task-finish-result/v2`；CLI 输出边界根据 detail 选择原样 full 或 closed compact 投影。compact 只保留 status、identity、phase、failure、next action、resume、关键 refs、timing 和 portable Execution Record 摘要，不产生新存储。

## 关键变化

- 缺省及显式 compact 返回 `buildr.task-finish-compact-result/v1`。
- 显式 full 保持 `buildr.task-finish-result/v2`。
- 非法 detail 在 Finish 副作用前拒绝。
- public JSON registry、文档、checkout/npm parity 和恢复场景测试同步更新。

## 影响、风险与兼容性

未显式 detail 的 JSON consumer 将看到新的 compact schema；依赖完整 v2 字段的 consumer 必须改为 `--detail full`。该迁移不改变 canonical Result、持久化或执行结果，回退时可恢复默认 full 而无需数据迁移。

## 验收摘要

同一 Result 的 compact/full schema 和字段明显不同；compact 在 complete、blocked、resume、Doctor blocked、target race 与 Delivery Adaptation 中保留全部行动事实；full 与 self-bootstrap consumer 保持兼容。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [公开 JSON 契约](specs/public-json-contracts/spec.md)
- [Task Finish 执行契约](specs/task-finish-execution/spec.md)
- [tasks.md](tasks.md)
