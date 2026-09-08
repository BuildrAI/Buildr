## ADDED Requirements

### Requirement: OpenSpec 内容查询与任务关联组合必须分属各自模块
Buildr MUST 由 OpenSpec 模块唯一拥有通用变更（Change）文件、列表、详情、归档定位、产物读取及通用操作提示词；任务模块 MUST 只组合任务关联、工作树（Worktree）选择、副本来源与任务展示，且 MUST 通过 OpenSpec 具名查询能力读取内容。OpenSpec 内容查询 MUST NOT 反向依赖任务模块。

#### Scenario: 查询全局变更内容
- **WHEN** 调用通用项目变更列表或详情
- **THEN** OpenSpec 查询 MUST 独立读取保留项目的内容，不依赖任务记录或工作树选择
- **AND** MUST 保持既有返回结构、错误、排序、归档标识和安全检查

#### Scenario: 查询任务关联变更内容
- **WHEN** 任务入口解析关联变更或界面原型（UI Prototype）
- **THEN** 任务侧 MUST 确定受信任的副本与来源，OpenSpec 查询 MUST 读取该副本的内容
- **AND** MUST 保持现有候选优先、保留回退、原型边界以及 HTTP 和页面行为
