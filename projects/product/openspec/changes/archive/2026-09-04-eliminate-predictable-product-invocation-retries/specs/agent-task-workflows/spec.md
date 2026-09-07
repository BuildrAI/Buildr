## ADDED Requirements

### Requirement: Task Verification Skill 必须先选择合法 invocation
Buildr 投射的 Task Verification Skill MUST 在调用命令前区分项目检查 invocation 与 current report writer invocation。对于 Buildr 自举 linked worktree，Skill MUST 给出 canonical retained Product bridge；对于普通 Workspace，Skill MUST 使用该 Workspace 的已安装或 retained Buildr，且 MUST NOT 把 `--target` 描述成 writer provenance。

#### Scenario: Agent 从自举 Task worktree 记录验证
- **WHEN** Agent 读取 Task Verification Skill 并发现当前 execution root 是 canonical Workspace 的 linked Task worktree
- **THEN** Skill MUST 指导 Agent 在 worktree 执行检查、在 canonical retained Product bridge 执行 report `inspect|record`
- **AND** Agent MUST 能在第一次写调用前完成选择而无需消费一次 provenance rejection

#### Scenario: 普通 Workspace 记录验证
- **WHEN** Agent 在非 Buildr Product 自举 Workspace 保存 Task Verification Report
- **THEN** Skill MUST 指导 Agent 使用该 Workspace 当前合法的 installed/retained Buildr writer
- **AND** MUST NOT 假设该 Workspace 存在 `projects/product/buildr`
