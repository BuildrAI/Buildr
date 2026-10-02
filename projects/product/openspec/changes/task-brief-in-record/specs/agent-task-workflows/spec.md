## MODIFIED Requirements

### Requirement: task-manager Skill 必须作为 Buildr Web 与 CLI 共享的 Task Record 薄管理入口
Buildr MUST交付现有`task-manager` workspace Skill作为`buildr.task-record/v4`默认provider，指导Agent创建、读取和维护正式Task Record。`task-manager` MUST不成为全局任务dispatcher或父任务流程总管。Buildr Web MUST作为同一Task Record Application的独立人类客户端；任一客户端 MUST不直接访问SQLite或migration scripts。

#### Scenario: 用户明确管理正式 Task
- **WHEN** 用户要求创建、查看、更正、完成或放弃正式Task
- **THEN** Agent MUST使用`task-manager`并先读取当前Task与digest
- **AND** 后续Review、Verification、Git、Worktree、发布和收尾 MUST继续由各自能力负责

#### Scenario: 用户按 Task ID 继续工作
- **WHEN** 用户或Agent提供已有Task ID并要求继续
- **THEN** `task-manager` MUST先inspect canonical Task Record
- **AND** MUST不从Task Record推断工作位置、Git、验证或交付事实

#### Scenario: 人先在 Buildr Web 创建 Task
- **WHEN** 用户查找Buildr Web任务创建入口
- **THEN** 页面 MUST不提供创建入口并引导交给Agent表达目标
- **AND** Agent创建后页面 MUST读取同一Task Record事实

#### Scenario: 普通任务请求
- **WHEN** 用户只提出实现、文档、测试、讨论或探索
- **THEN** `task-manager` MUST不因出现“任务”一词自动创建正式记录
- **AND** Agent MUST先判断是否需要长期Task事实

#### Scenario: Skill 返回存储细节
- **WHEN** Task action成功或blocked
- **THEN** Skill MUST只报告业务结果、digest、effects与diagnostic
- **AND** MUST不要求用户编辑SQLite或migration ledger

#### Scenario: Buildr Web修改Task
- **WHEN** 用户在Buildr Web编辑、完成或放弃已有Task
- **THEN** 页面 MUST调用与CLI相同的Application和当前digest保护
- **AND** MUST不通过Skill routing写记录或维护第二状态机

#### Scenario: 创建或继续正式说明
- **WHEN** 用户授权开始或继续 code-only、文档或 OpenSpec 任务
- **THEN** task-manager MUST 通过 Task Record 的 brief 字段保存和读取真实说明，不创建新的 brief 材料引用
- **AND** 其他专业技能 MUST 使用同一记录正文及 @task/<task-id> 稳定引用；旧说明导入 MUST 使用显式产品动作并报告当前事实
