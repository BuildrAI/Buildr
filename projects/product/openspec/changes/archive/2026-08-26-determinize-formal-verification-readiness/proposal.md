## Why

正式任务（Formal Task）目前在稳定内容目标（Content Target）之后先按声明生成验证政策（Verification Policy）并冻结候选（Candidate），正式验证计划（Formal Verification Plan）却在随后才形成。计划选择改变能力集合或补出准备闭包时，智能体（Agent）只能回头改政策、准备环境并重新冻结，造成不必要的 Candidate 代次、重复验证和命令往返。

## What Changes

- 将稳定 Content Target 后的默认下一步改为先形成 closed Formal Verification Plan，再从同一 Plan 确定性派生默认 policy 输入与未选择能力摘要。
- Plan 要求额外准备时，继续复用现有 Task Environment closed plan request；准备完成后再记录 policy、冻结 Candidate，并以同一 Plan 执行正式验证。
- 保留无 Plan 的声明默认发现作为合法降级路径；不自动 prepare、freeze、run，不把推荐工作流变成通用许可层。
- 只有 target、declaration、capability、Plan 与正式 invocation identity 精确一致时复用既有正式证据；不削减覆盖、不静默重试。
- 不包含破坏性变更；旧调用方和旧 Development Receipt 继续兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`: 稳定 Content Target 后先推荐 Formal Verification Plan，并允许从 current closed Plan 确定性派生 policy 输入后再冻结 Candidate。
- `task-verification`: Formal Plan 能向 Task Development 提供经 current target/declaration 校验的 selected 与 not-selected disposition，同时保持 Plan 复用和正式 Result authority 边界。

## Impact

- Task Development Application、内部 driver schema/runner 与 `task next` 推荐动作。
- Task Verification Application 的只读 Plan→policy 投影。
- `task-development`、`task-verification` 内置 Skill 与对应契约/集成测试。
- 不修改 Verification Result、Execution Record、Environment Receipt、Candidate identity 或公共 HTTP 契约。
