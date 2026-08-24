## MODIFIED Requirements

### Requirement: 父任务贡献项必须呈现动态迁移进度
Buildr Web MUST 将 Parent Coordination v3 返回的 Parent Plan Contribution、真实 Child Task、Contribution binding 与 Contribution Handoff 即时组合为只读迁移进度视图，并 MUST 按“进行中 / 已交付”“可启动”“等待依赖”的固定顺序分组。页面 MUST 使用中文呈现用户可见的业务术语、状态、标题、操作和空态；稳定 Contribution ID、Task ID 与内部路由标识 MAY 保留原值。桌面端 MUST 使用“贡献项、实际子任务、贡献交接或依赖、详情入口”的紧凑横向信息结构，顶部 MUST 展示“已交付、剩余工作、已取代、进行中”四项动态摘要，并 MUST 提供只读贡献项详情侧栏。该视图 MUST NOT 写回 Parent Plan、创建第二套进度存储、因普通进度变化触发 Plan reconcile 或使 Planning Review stale。

#### Scenario: 按迁移状态分组
- **WHEN** 父任务同时存在已关联实际 Child、未关联且 eligible 的 Contribution，以及等待依赖的 Contribution
- **THEN** UI MUST 依次显示“进行中 / 已交付”“可启动”“等待依赖”三个分组
- **AND** 每个 Contribution MUST 只出现在一个分组中
- **AND** UI MUST NOT 按计划优先级创建另一套顶层分组

#### Scenario: 显示四项迁移摘要与事实来源
- **WHEN** 父任务页面展示动态迁移进度
- **THEN** 推荐行动区域 MUST 同时显示“已交付、剩余工作、已取代、进行中”四项当前计数
- **AND** 页面 MUST 明确进度由父任务计划、直接子任务与贡献交接动态派生
- **AND** 页面 MUST 明确该进度不写回父任务计划

#### Scenario: 桌面端使用紧凑横向进度行
- **WHEN** 浏览器处于桌面宽度并显示一个 Contribution
- **THEN** 同一进度行 MUST 依次呈现 Contribution 标识与状态、实际 Child、Contribution Handoff 或依赖摘要以及详情入口
- **AND** 状态、交付摘要、下一步行动和阻塞原因 MUST 在行内可扫读
- **AND** UI MUST NOT 把每个 Contribution 默认展开为包含目标、方向和边界的纵向长卡片

#### Scenario: 打开贡献项详情侧栏
- **WHEN** 用户点击 Contribution 进度行或其详情入口
- **THEN** UI MUST 打开只读详情侧栏并展示目标、实现方向、边界、依赖、预期 Child 与适用的 Handoff 证明
- **AND** 关闭侧栏 MUST 返回原父任务页面且不创建独立路由或写入

#### Scenario: 从父任务进入实际子任务
- **WHEN** Contribution 已通过 binding 关联一个或多个实际 Child Task
- **THEN** UI MUST 显示每个 Child 的中文任务状态、标题和 Task ID
- **AND** Child 标题与显式操作 MUST 导航到同一工作空间既有任务详情路由
- **AND** 点击 Child 导航 MUST NOT 同时打开 Contribution 详情侧栏
- **AND** 该导航 MUST NOT 创建独立迁移详情页或改变 Parent/Child relation

#### Scenario: Child completed 但没有 Contribution Handoff
- **WHEN** 实际 Child Task 状态为 `completed` 且 Parent Coordination 返回 `deliveryProven=false` 或没有匹配 delivery
- **THEN** UI MUST 显示该 Child Task 已完成并同时显示“交付未证明”
- **AND** UI MUST NOT 将 Contribution 标记为“已交付”或生成交付摘要

#### Scenario: Contribution Handoff 提供交付摘要
- **WHEN** 匹配 Child 的 Contribution Handoff 包含 `delivered`、`residual`、`superseded` 和 `nextAction`
- **THEN** UI MUST 以简洁中文标签展示所有非空事实及下一步行动
- **AND** “已交付”状态 MUST 只由该 matching Contribution Handoff 证明

#### Scenario: Contribution 等待具体依赖
- **WHEN** Contribution 的 eligibility 返回一个或多个 dependency blocker
- **THEN** UI MUST 在“等待依赖”分组显示依赖 Contribution 的标题和稳定 ID
- **AND** UI MUST 显示由 read model 提供的具体阻塞原因，且 MUST NOT 在浏览器重算 readiness

#### Scenario: 窄屏保持完整迁移信息
- **WHEN** 浏览器处于窄屏宽度
- **THEN** Contribution 进度行 MUST 降级为单列信息顺序并保持详情入口可操作
- **AND** 四项迁移摘要 MUST 以两列或单列方式完整显示
- **AND** Child、交付摘要、下一步行动与阻塞原因 MUST NOT 被隐藏或产生页面水平溢出

#### Scenario: 普通进度只改变动态视图
- **WHEN** Child Task 状态、binding 或 Contribution Handoff 事实发生普通进度变化而 Parent Plan 协调内容未改变
- **THEN** 刷新后的页面 MUST 从当前 read model 反映新事实
- **AND** 页面 MUST NOT 提交 Parent Plan reconcile、Planning Review 更新或任何独立进度写入
