## Why

现行规范仍把诊断（Doctor）定义为核心规则（Core Rule）的统一任务完成条件，并要求不存在的旧收尾运行（Finish Run）在缺口下不启动；这与当前核心规则的动作局部约束、Buildr 技能（Skill）的资产维护职责和已交付的独立收尾方式冲突。本轮集中优化需要消除这两项规范承诺矛盾，使智能体（Agent）依据同一套当前边界继续工作。

## What Changes

- **BREAKING**：取消旧规范对全局诊断（Doctor）完成门禁及旧收尾运行（Finish Run）的依赖；这影响依赖旧治理承诺的工作方法，不改变现有命令、接口（API）或数据格式。
- 将资产维护后的诊断（Doctor）核验归属 Buildr 技能（Skill）及适用的专属维护者，复用同一现场已有的最终结果；只阻止依赖具体错误事实的完成结论或危险动作，不阻止无关工作。
- 将收尾缺口的代表性证明改为当前具体能力的写入、交付和清理边界，保留已成立事实和可独立执行的安全动作，不创建替代收尾状态。
- 核对长期任务协作说明中的诊断职责和完成边界，按最终承诺维护必要解释及来源关联。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-first-runtime-projection`：修改“Buildr 状态变更后必须 doctor 验证”，将统一任务完成门禁改为资产维护动作的诊断核验与局部结果判断。
- `governance-gate-taxonomy`：修改“代表性基础证明”，保留准备声明缺口场景，将收尾缺口场景绑定当前具体能力，移除旧收尾运行（Finish Run）启动判断。

## Impact

- 正式规范（Specification）：上述两个现有条款及其完整场景；增量不涉及工作空间（Workspace）双重管理判断或登记锁恢复，后者由同任务的独立变更处理。
- 当前知识：`knowledge/docs/architecture/task-system.md` 中的完成、诊断与局部失败解释；只有实际受影响内容需要修改，不新增知识状态库或图示。
- 实现依据：随包核心规则、产品入口 Buildr 技能（Skill）、`task-finish` 及具体 Git、工作树（Worktree）和资源能力。它们保持当前职责，不新增运行器（Runner）、接口（API）、能力契约（Capability Contract）或技能（Skill）依赖。
- 验证：增量严格校验、语义合流预检、文档及规范质量检查、直接来源和现有写入保护检查的适用性核对。文本检查只证明规范一致，不能冒充真实智能体（Agent）执行行为或用户现场验收。
