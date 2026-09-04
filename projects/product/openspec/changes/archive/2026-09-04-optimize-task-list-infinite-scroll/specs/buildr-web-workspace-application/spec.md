## ADDED Requirements

### Requirement: Buildr Web 任务信息流必须按 50 条滚动续载
Buildr Web Task 列表 MUST 保持连续滚动的信息流形态，并 MUST 显式以每批 50 条请求 Task query projection。页面 MUST 在用户浏览到当前批次约第 40 条时预取下一批并追加结果，不得要求用户操作传统页码控件。

#### Scenario: 浏览到当前批次第 40 条
- **WHEN** 当前批次有后续结果且用户滚动到该批次约第 40 条
- **THEN** Web MUST 使用当前 `nextCursor` 发起且只发起一次下一批请求
- **AND** 成功结果 MUST 追加到现有信息流，不清空已显示 Task

#### Scenario: 下一批正在读取
- **WHEN** 预取请求尚未结束
- **THEN** Web MUST 保留当前已加载内容并显示局部续载反馈
- **AND** 重复进入预取位置 MUST NOT 为同一 cursor 创建并发重复请求

#### Scenario: 下一批读取失败
- **WHEN** 首批读取成功但后续批次失败
- **THEN** Web MUST 保留已加载 Task 并提供局部重试
- **AND** MUST NOT 把续载失败显示为整个列表为空或首次读取失败

#### Scenario: 已加载最后一批
- **WHEN** 响应返回 `hasMore=false`
- **THEN** Web MUST 停止观察和请求后续批次
- **AND** 信息流 MUST 保留全部已追加结果

### Requirement: Task 信息流搜索与筛选必须作用于完整结果集
Buildr Web MUST 把已防抖关键词、Project、Service、status、hasChildren 与 retrospectiveState 一并提交给 Task query projection。Workspace 或任一查询条件变化时，Web MUST 取消陈旧请求、清空旧分页状态并从第一批重新读取；旧响应不得覆盖或追加到新查询结果。

#### Scenario: 输入搜索关键词
- **WHEN** 用户修改任务搜索词且短防抖结束
- **THEN** Web MUST 从第一批请求服务端完整筛选结果
- **AND** MUST NOT 只过滤当前已加载批次

#### Scenario: 修改筛选条件
- **WHEN** 用户确认新的状态、Project、Service、Child 或复盘筛选
- **THEN** Web MUST 废弃旧 cursor 与已追加批次，并按新条件读取首批 50 条

#### Scenario: 新旧续载响应交错
- **WHEN** 旧查询的首批或续载响应晚于新查询响应到达
- **THEN** Web MUST 只采用当前 Workspace、查询条件与请求代次匹配的响应
- **AND** 旧响应 MUST NOT 改变 tasks、匹配数量、filter options、续载状态或空状态

### Requirement: Task 信息流排序必须由服务端保持跨批一致
分页查询 MUST 在服务端使用与当前 Buildr Web 等价的状态优先和更新时间顺序，并以 Task ID 作为稳定最终排序键。客户端 MUST 按批次顺序追加，不得仅在单个批次内重新排序而破坏全局顺序。

#### Scenario: 多批次包含不同状态和相同更新时间
- **WHEN** 完整筛选结果跨越多个批次，并包含不同状态或相同 `updatedAt` 的 Task
- **THEN** 用户观察到的完整信息流 MUST 保持 `todo`、`active`、其他终态，再按 `updatedAt` 倒序和 `taskId` 正序排列
- **AND** 批次边界 MUST 不产生重复或遗漏
