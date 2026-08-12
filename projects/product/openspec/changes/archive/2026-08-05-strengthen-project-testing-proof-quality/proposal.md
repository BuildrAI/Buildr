## Why

`project-testing` 已能指导 Agent 按真实项目事实选择测试意图、执行边界、owner 与编排范围，但没有明确约束测试案例如何从待证明事实派生，也没有要求新增测试证明自身能够捕获错误。Agent 因而可能选对 Unit、Component 或 Integration 层级，却仍写出断言过弱、遗漏失败与边界行为或过度 mock 的测试。

## What Changes

- 为 `project-testing` 增加最小测试质量闭环：待证明事实、公共可观察结果、关键正常/失败/边界/状态案例、最低充分边界、测试实现与有效性检查。
- 明确 Bug 回归测试应提供能在修复前、错误实现或移除修复后失败的证据；无法安全执行对照时必须说明证据 gap，不得伪造。
- 明确替身只隔离外部协作者，测试优先断言公共行为；涉及状态或副作用时检查隔离、幂等、清理和重复运行。
- 扩充随包 reference 与契约测试，固定上述指导存在且仍保持无状态、无 capability contract、无通用 QA 平台。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-testing-guidance`: 从“选择正确测试边界与编排”扩展为同时指导 Agent 推导关键测试案例并检查新增测试的有效性。

## Impact

- 修改随包 Workspace Skill `project-testing` 及 `testing-model-v1.md` reference。
- 修改 `project-testing-guidance` canonical spec、Buildr package 静态校验与专项契约测试。
- 更新 `project-testing` 资产维护记录；不改变 `verification.yml`、Task Verification schema、capability graph、CLI 或 runtime adapter。
