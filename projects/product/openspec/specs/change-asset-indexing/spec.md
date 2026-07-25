# Change Asset Indexing Specification

## Purpose

定义 Buildr 对已登记项目中进行中与已归档 OpenSpec Change 的安全只读索引、标准产物详情、任务进度和 Agent 操作边界。
## Requirements
### Requirement: Buildr 必须安全索引 Project 的 active 与 archived Change
Buildr MUST 从已登记 Project 的 canonical OpenSpec planning root 生成 Change read model，并 MUST 将 active 与 archived lifecycle 分开表达，不建立第二套持久化状态。

#### Scenario: 列出 active Change
- **WHEN** Project 的 `openspec/changes/<change>` 存在合法 change 目录
- **THEN** Change collection MUST 返回 Project identity、change code、`active` lifecycle、更新时间、artifact availability 和任务进度
- **AND** MUST NOT 因任务全部完成而把 active Change 标记为 archived

#### Scenario: 列出 archived Change
- **WHEN** Project 的 `openspec/changes/archive/<archive-entry>` 存在合法归档目录
- **THEN** Change collection MUST 返回 `archived` lifecycle、稳定 archive reference 和可用的原始 change code
- **AND** MUST 保留 archive entry，不得依赖猜测出的日期或名称定位目录

#### Scenario: Project 没有 OpenSpec planning root
- **WHEN** 已登记 Project 不包含 canonical OpenSpec changes 目录
- **THEN** Change collection MUST 返回空集合
- **AND** MUST NOT 创建目录、运行迁移或把缺失状态报告为读取失败

### Requirement: Change 详情必须按需投影标准 artifacts
Buildr MUST 为单个 Change 返回 identity、lifecycle、任务进度、标准 artifact 内容和 Buildr companion Brief，并 MUST 对 Project、Change 与文件路径执行边界校验。Brief MUST 只从已解析 Change root 内的 `brief.md` 读取，且 MUST 与标准 artifacts 分别表达 availability 和 source path。

#### Scenario: 读取完整 Change
- **WHEN** 请求命中存在的 active 或 archived Change
- **THEN** 详情 MUST 返回 Brief、proposal、design、specs 和 tasks 的可用内容与来源路径
- **AND** specs MUST 使用稳定 capability 与相对路径标识
- **AND** Brief MUST 标识为 Buildr companion artifact，不得伪装成 OpenSpec 标准 artifact

#### Scenario: 读取部分完成 Change
- **WHEN** Change 仅包含部分标准 artifacts 或缺少 Brief
- **THEN** 详情 MUST 明确每类 artifact 和 Brief 是否存在
- **AND** MUST 保留已有内容，不得伪造缺失内容、Brief 或完成状态

#### Scenario: Change reference 非法或不存在
- **WHEN** 请求包含路径穿越、非法 identity 或无法在目标 Project 中解析的 Change reference
- **THEN** Application MUST 拒绝请求或返回 not found
- **AND** MUST NOT 读取 Project planning root 外的文件

#### Scenario: Brief source 越过 Change root
- **WHEN** `brief.md` 路径、符号链接或解析结果越过目标 Change root
- **THEN** Application MUST 将 Brief 报告为不可安全读取并拒绝返回内容
- **AND** MUST NOT 因标准 artifacts 合法而放宽 companion 文件边界

### Requirement: Change 任务进度必须来自只读任务事实
Buildr MUST 只根据 Change 的 `tasks.md` checkbox 计算任务总数和完成数，并 MUST 将未知或缺失任务文件与零任务区分。

#### Scenario: tasks 包含完成与未完成项
- **WHEN** `tasks.md` 同时包含 `- [x]` 与 `- [ ]` 任务
- **THEN** read model MUST 返回准确的 complete、total 和 remaining 数量

#### Scenario: tasks 文件缺失
- **WHEN** Change 不包含 `tasks.md`
- **THEN** read model MUST 标记 tasks artifact 不存在
- **AND** MUST NOT 把缺失任务文件解释为已完成

### Requirement: Change 生命周期操作必须交给 Agent
Buildr MUST 为 Change 创建、继续与审阅生成完整 Agent prompt，并 MUST NOT 从本机应用直接创建、修改、apply、sync 或 archive OpenSpec change。

#### Scenario: 创建 Change prompt
- **WHEN** 用户在 Change 管理页面选择所属 Project 并描述目标
- **THEN** Application MUST 生成要求 Agent 核对 scope、选择 worktree、使用 OpenSpec propose 并验证状态的完整 prompt
- **AND** 生成 prompt MUST 零写入

#### Scenario: 继续或审阅 Change prompt
- **WHEN** 用户对已存在 Change 选择继续或审阅
- **THEN** Application MUST 生成包含 Project、change identity、当前 lifecycle 和目标 action 的完整 prompt
- **AND** prompt MUST 要求 Agent 读取真实 artifacts 和当前状态后再决定下一步

#### Scenario: archived Change 请求继续
- **WHEN** 用户对 archived Change 生成 Agent prompt
- **THEN** prompt MUST 明确该 Change 已归档
- **AND** MUST 要求 Agent 判断是只读审阅还是创建后续 Change，不得直接修改历史归档
