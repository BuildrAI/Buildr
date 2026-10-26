## REMOVED Requirements

### Requirement: Buildr 产品入口必须路由 v3 Verification authority
**Reason**: 清理旧分类、入口及技能职责，保留对应行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

### Requirement: 测试建设与 Task Verification 必须使用独立入口
**Reason**: 清理旧分类、入口及技能职责，保留对应行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

### Requirement: Task Verification Skill 必须先选择合法 invocation
**Reason**: 清理旧分类、入口及技能职责，保留对应行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

## ADDED Requirements

### Requirement: 项目验证技能（project-verification） 必须先选择合法 invocation
Buildr 投射的 项目验证技能（project-verification） MUST 在调用命令前区分项目检查 invocation 与 current report writer invocation。对于 Buildr 自举 linked worktree，Skill MUST 给出 canonical retained Product bridge；对于普通 Workspace，Skill MUST 使用该 Workspace 的已安装或 retained Buildr，且 MUST NOT 把 `--target` 描述成 writer provenance。

#### Scenario: Agent 从自举 Task worktree 记录验证
- **WHEN** Agent 读取 项目验证技能（project-verification） 并发现当前 execution root 是 canonical Workspace 的 linked Task worktree
- **THEN** Skill MUST 指导 Agent 在 worktree 执行检查、在 canonical retained Product bridge 执行 report `inspect|record`
- **AND** Agent MUST 能在第一次写调用前完成选择而无需消费一次 provenance rejection

#### Scenario: 普通 Workspace 记录验证
- **WHEN** Agent 在非 Buildr Product 自举 Workspace 保存 Task Verification Report
- **THEN** Skill MUST 指导 Agent 使用该 Workspace 当前合法的 installed/retained Buildr writer
- **AND** MUST NOT 假设该 Workspace 存在 `projects/product/buildr`

### Requirement: 测试必须由两个职责明确的技能承接
Buildr SHALL 交付 `project-testing` 与 `project-verification` 两个测试技能（Skill）。前者 SHALL 负责测试设计、实现、分类、稳定入口与测试地图维护；后者 SHALL 负责读取目标、选择检查、核对条件、调用真实工具、判断证据并保存有意义报告。两个技能（Skill）SHALL 不维护重复成员清单或第二份运行状态。更名 SHALL 保持现有任务报告应用协议及 `buildr.task-verification/v4` 的兼容保证，项目级选择不强制创建任务。

#### Scenario: 新增测试后运行
- **WHEN** 智能体（Agent）新增测试或修改稳定入口
- **THEN** project-testing SHALL 完成建设与登记，project-verification SHALL 读取当前事实选择执行，不经过独立声明接入技能（Skill）

### Requirement: 验证必须支持开发推送前和用户显式请求
智能体（Agent）SHALL 在开发中根据任务目标和真实影响选齐四类必要验证，在推送 Buildr 产品代码前完整覆盖四服务当前源码静态与单元检查，并按用户显式要求执行指定类型、检查或完整集合。自动路径选择 SHALL 只提供辅助；需要真实技术连接、构建安装后或用户流程证明时 SHALL 追加对应检查。授权内可修复问题 SHALL 自行处理；新的外部副作用、业务语义冲突或例外放行 SHALL 向用户说明准确影响请求决定。

#### Scenario: 用户没有任务只要求一个检查
- **WHEN** 用户明确要求运行有效检查身份或类型
- **THEN** 智能体（Agent）SHALL 通过公开入口执行，不要求正式任务或猜测 Git 基线，保存实际证据或直接报告结果

#### Scenario: 推送前检查不完整
- **WHEN** 推送前必要检查失败或环境缺项
- **THEN** 智能体（Agent）SHALL 不声称通过或自行略过，继续独立安全工作，反馈真实失败、未覆盖和所需决定
