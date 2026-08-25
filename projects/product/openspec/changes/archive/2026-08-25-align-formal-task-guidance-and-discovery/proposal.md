## Why

正式 Task 的三个既有入口仍存在操作引导断点：Verification 在 Environment preparation 预检阻塞时，默认 compact 输出隐藏生成 Plan 所需的 `admission.recovery.planRequest`；Environment Plan record 没有同源输入发现；Parent 已完成 current Acceptance 后，`task next` 仍重复推荐验收。这些断点会迫使 Agent 试错或重复执行已完成动作。

## What Changes

- 当 Formal Verification 在创建 durable Execution Record 前因 preparation blocked 退出时，compact summary 继续保持 `recovery: null`，但 `primaryFailure.message` 明确要求以同一 invocation 加 `--detail full` 取得既有 `admission.recovery.planRequest`。
- `task environment plan record` 增加互斥的 `--schema` 与 `--example` 只读发现，直接复用实际 Plan request 校验定义与示例，不读取 Workspace、不写 Receipt。
- current Parent Acceptance 已绑定 current Parent Plan 时，Parent startup projection 不再生成 `accept-parent` next，使 `task next` 保留 Task Development 的真实 typed next。
- 同步随包 Task Skills 与入口/组合回归测试。
- 不新增 capability、authority、store、gate、自动推进或 schema major；无破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-execution-artifacts`：补充 pre-admission preparation blocked 的 compact/full 安全降级契约。
- `cli-product-surface`：为 Environment Plan record 增加同源、零副作用的输入发现入口。
- `task-development`：规定 current Parent Acceptance 后 startup next 不得覆盖 Development next。
- `agent-task-workflows`：让随包 Skills 消费上述发现与降级路径，不重复 Parent Acceptance。

## Impact

- 代码：Verification compact 投影、Task Environment CLI parser/help、Parent coordination startup projection与 Task Entry composition。
- 文档：OpenSpec delta specs、随包 `task-verification`、`task-environment`、`task-development` Skill 指引。
- 测试：compact summary、Environment CLI discovery、Parent Acceptance 后 `task next` 的 unit/integration/contract 回归。
- 依赖与持久化：无新增依赖、表、Receipt 字段或迁移。
