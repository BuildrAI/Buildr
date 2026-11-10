## MODIFIED Requirements

### Requirement: Buildr Skill 前置说明 Skill 类型和安装方式
Buildr 内置 Skill 的 `SKILL.md` MUST 在资产维护细节前说明 workspace Skill source 类型、项目规则适用边界和 user/workspace render destination。

#### Scenario: 前置 Skill 类型
- **WHEN** Agent 阅读 Buildr Skill
- **THEN** Buildr Skill MUST 先说明本地作者型 Skill 和远端发布型 Skill 的区别
- **AND** Buildr Skill MUST 说明两类 Skill 都登记到 workspace source authority
- **AND** Buildr Skill MUST 说明 Project 专用语义由项目规则与技能说明表达

#### Scenario: 前置三种登记方式
- **WHEN** Agent 阅读 Buildr Skill
- **THEN** Buildr Skill MUST 说明本地源目录、远端信息源和已解析安装源三种 workspace 登记方式
- **AND** Buildr Skill MUST 引导 Agent 先登记 source，再在能解析时升级为 resolved

#### Scenario: 前置两种 render destination
- **WHEN** Agent 阅读 Buildr Skill
- **THEN** Buildr Skill MUST 说明 `workspace` destination 只面向当前工作目录
- **AND** Buildr Skill MUST 说明 `user` destination 需要显式授权并面向当前用户的其他工作目录
- **AND** Buildr Skill MUST NOT 把 Project 描述为第三种 source 或 destination

### Requirement: Project Skill 源资产迁移保持保守和可恢复
Buildr MUST 提供 legacy Project Skill migration check/apply，使历史 Project Skill sources 收敛到 workspace authority，且无法无歧义合并时 MUST 保留现场。

#### Scenario: Legacy Project 独有 Skill
- **WHEN** legacy Project manifest 的 Skill ID 不存在于 workspace manifest
- **THEN** migration plan MUST 将该 Skill 移动或登记为 workspace Skill
- **AND** MUST NOT 创建项目能力配置；适用边界由技能说明表达

#### Scenario: Workspace 与 legacy Project Skill 等价
- **WHEN** legacy Project Skill 与 workspace Skill 的 identity/content 可证明等价
- **THEN** migration plan MUST 去重 Project 副本，适用边界由技能说明表达
- **AND** MUST NOT 改变 workspace canonical Skill 内容

#### Scenario: Workspace 与 legacy Project Skill 同名不同内容
- **WHEN** legacy Project Skill 与 workspace Skill ID 相同但内容或来源不同
- **THEN** Buildr MUST 报告 `project_skill_name_conflict`
- **AND** migration apply MUST 零写入，直到用户选择重命名、canonical 版本或放弃迁移

#### Scenario: Migration apply 失败
- **WHEN** migration 在 workspace manifest、源目录或最终 doctor 任一步失败
- **THEN** Buildr MUST 恢复事务前状态并保留 recovery evidence
- **AND** Buildr MUST NOT 删除 legacy Project Skill 源
