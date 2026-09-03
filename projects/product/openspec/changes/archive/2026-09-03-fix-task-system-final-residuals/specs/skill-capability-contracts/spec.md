## MODIFIED Requirements

### Requirement: 现有 capabilities 必须扩展最小协作保证
Task Record、Review、Verification、父任务协调、Git Worktree 与默认 Task Finish contracts MUST分别保证顶层事实与关系、可选审查 current、验证报告 current、父任务完成观察与授权、Git 工作位置/删除安全，以及 Agent 驱动的结果登记和资源善后。Capability graph MUST不要求 Development、Environment、Parent Plan mutation、Contribution Handoff、旧 Finish Result、统一进度或第二协调 store。

#### Scenario: capability graph 验证
- **WHEN** package 验证解析更新后的 providers 与 consumers
- **THEN** selected bindings MUST保持 ready 且 major 版本与当前保证一致
- **AND** graph MUST不包含已退役 Task workflow provider 或隐式依赖

## REMOVED Requirements

### Requirement: 顶层Parent coordination入口必须可发现且不歧义
**Reason**: 原要求仍把 Parent Plan reconcile/record 当作当前能力；当前父任务协调只有只读 inspect，关系与完成写入归 Task Record。

**Migration**: 使用 `task parent inspect` 读取当前父子事实；关系更新和明确授权完成使用 Task Record v3 动作。

#### Scenario: 请求旧 Parent Plan reconcile
- **WHEN** 用户或 Agent 请求旧 Parent Plan mutation
- **THEN** 当前 Skill/CLI MUST不提供该动作
- **AND** MUST指向父任务协调 inspect 与 Task Record 当前动作
