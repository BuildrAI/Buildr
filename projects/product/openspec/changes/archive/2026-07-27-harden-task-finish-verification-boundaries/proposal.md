## Why

当前 Task Finish 会执行正式保证，但当验证发现新的实现或契约缺陷时，Agent 可能把诊断、修复和重新验证静默并入“收尾”，既越过用户决策边界，也让端到端 wall-clock 无法区分 verification、repair、re-verification 与真正 closeout。最近一次真实收尾还暴露出两个可前置发现的问题：持久化 OpenSpec receipt 保存机器绝对路径，以及受影响 Skill 的聚焦契约未在完整 affected 前执行。

## What Changes

- Task Finish 在正式保证失败后必须停止并返回结构化 repair decision，不得默认修改实现、契约、测试或历史资产；只有用户预先或事后明确授权“修复并继续”时，才能进入独立 repair/re-verification 阶段。
- 将真正 closeout 定义为有效正式保证之后的资产审查、归档、集成推送、runtime install 与 cleanup；completion timing 独立记录 verification、repair、re-verification 和 closeout，不再把全过程统称为收尾耗时。
- 在完整 affected/Candidate 前，根据候选改动和 Project verification registry 执行低成本、确定性的聚焦 preflight；preflight 失败时不启动完整正式保证。
- OpenSpec convergence receipt 等可持久化或进入候选树的证据不得保存机器/用户绝对路径；运行定位与持久化 identity 分离，并增加历史/新 receipt 的契约覆盖。
- 改进失败摘要，使真正失败的 stage、test/finding 和 repair decision 优先于非阻塞预算 warning，避免必须读取大 diagnostic 才能定位失败。
- 本 Change 不改变用户已明确授权“发现问题直接修复并继续”的能力，但该授权、repair identity、重新验证次数和耗时必须显式留证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 明确验证失败后的用户决策边界、repair/re-verification 状态与 closeout-only timing 口径。
- `task-verification`: 增加候选感知的聚焦 preflight、失败摘要优先级，以及 verification 与 re-verification 的独立 evidence/timing。
- `openspec-deterministic-sync`: 要求持久化 convergence receipt 使用可移植 executable identity，不记录机器/用户绝对路径。

## Impact

- Task Finish 状态机、completion receipt、compact diagnostics、CLI JSON contracts 与 Task Finish Skill/capability contract。
- Project verification registry/selector、affected/Candidate 执行计划与相关 unit/contract/integration tests。
- OpenSpec convergence receipt schema、生成与兼容读取，以及 open-source candidate/contract fixtures。
- Product current knowledge 中的 Task Finish 流程和持续优化任务看板。
- 无公开命令删除或已有成功路径破坏性变更；旧 receipt 读取保持兼容，但新写入必须采用可移植 identity。
