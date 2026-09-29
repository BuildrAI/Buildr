## ADDED Requirements

### Requirement: 工作树调用指引必须在不同宿主中保持契约与资源归属一致

Buildr 的工作树（Worktree）调用指引 MUST 要求智能体（Agent）在创建、检查和清理时遵循当前有效能力绑定（Capability Binding）及 `buildr.git-worktree-provider/v1`，保留 `.worktrees/<task-id>`、逐仓身份与删除安全保证。指引 MUST 区分工具可用、契约兼容和既有资源归属，MUST NOT 把某一宿主的原生工具或目录当成通用例外。

#### Scenario: 宿主同时提供原生创建工具
- **WHEN** 当前宿主存在原生工作树（Worktree）工具，但没有证据证明它是满足当前契约的已选提供者（Provider）
- **THEN** 指引 MUST 要求按已有绑定调用，不凭工具可用性替换实现或默认目录
- **AND** 宿主硬性要求无法与当前契约同时满足时 MUST 说明具体不兼容，只停止受影响动作

#### Scenario: 当前任务已有其他入口创建的位置
- **WHEN** 当前任务已有工作位置，但已选提供者（Provider）不能核实其身份或兼容既有证据
- **THEN** 指引 MUST 要求保留现场并报告差异
- **AND** MUST NOT 为满足目录约定另建同任务副本、自动迁移或补造登记

#### Scenario: 绑定变化后尝试清理旧资源
- **WHEN** 当前能力绑定（Capability Binding）与既有工作树（Worktree）的创建实现不同
- **THEN** 指引 MUST 要求先核对真实资源归属及新实现对既有证据的兼容性
- **AND** 无法核验时 MUST 保留目录，不混用清理入口，也不撤销已成立的交付事实

### Requirement: 新工作树标识默认使用稳定语义名称

Buildr 的任务与工作树（Worktree）指引 MUST 在为新工作选择任务标识（Task ID）时默认使用简短、稳定的语义名称，不主动添加日期。已有任务标识（Task ID）和用户明确命名 MUST 继续沿用；该默认值 MUST NOT 改变命令接受的合法格式或创建另一套名称字段。

#### Scenario: 没有既有标识或用户指定名称
- **WHEN** 智能体（Agent）需要为新工作选择标识且用户没有规定命名
- **THEN** 指引 MUST 使用 `worktree-contract-consistency` 这类语义名称，不因当天日期主动添加前缀
- **AND** 必须区分同名但不同的任务时 MUST 核对真实归属并使用简短语义后缀，而不是复用他人目录

#### Scenario: 既有标识或用户命名包含日期
- **WHEN** 继续已有任务或用户明确指定了合法的带日期名称
- **THEN** 指引 MUST 保留其标识和已有位置，不拒绝、截去日期、另建记录或自动重命名

#### Scenario: OpenSpec 变更进入归档
- **WHEN** 关联的 OpenSpec 变更归档并获得归档日期
- **THEN** 指引 MUST 保持工作树（Worktree）与分支名称不变
- **AND** 归档本身 MUST NOT 替代原有交付核验和清理条件
