## ADDED Requirements

### Requirement: Task query projection 必须支持稳定的可选游标分页
Task Record Application MUST 支持调用方以可选 `pageSize` 和不透明 `cursor` 分批读取完整筛选结果。`pageSize` MUST 是有界正整数；提供分页时，响应 MUST 返回当前批次大小、完整筛选结果数量、是否仍有后续结果和下一游标。未提供 `pageSize` 的 Application 调用 MUST 保持返回全部匹配 Task 的兼容语义。

#### Scenario: 读取第一批 Task
- **WHEN** 调用方提交合法筛选和 `pageSize=50`，且匹配结果超过 50 条
- **THEN** Application MUST 按确定顺序返回前 50 条、完整匹配数量、`hasMore=true` 与非空 `nextCursor`
- **AND** 原 `totalTaskCount` MUST 继续表示 Workspace 全部 Task 数量

#### Scenario: 使用游标读取下一批
- **WHEN** 调用方以同一筛选和第一页返回的 `nextCursor` 请求下一批
- **THEN** Application MUST 从上一批最后一条确定排序键之后继续返回结果
- **AND** 相同排序键的 Task MUST 以 `taskId` 确定边界，不得重复或遗漏

#### Scenario: 最后一批 Task
- **WHEN** 当前批次已经包含筛选快照中的最后一条匹配 Task
- **THEN** Application MUST 返回 `hasMore=false` 与空 `nextCursor`

#### Scenario: 拒绝不匹配的游标
- **WHEN** cursor 非法、pageSize 越界或 cursor 与当前筛选条件不匹配
- **THEN** Application MUST 零写入拒绝请求并返回封闭的 Task list filter diagnostic

#### Scenario: 未分页调用保持兼容
- **WHEN** Application 调用方未提供 `pageSize` 和 `cursor`
- **THEN** Application MUST 返回全部匹配 Task，并保持既有筛选与 stored-state projection 语义

### Requirement: 分页 Task 列表必须保持轻量 stored-state projection
分页与未分页 Task 列表 MUST 只从 canonical Workspace SQLite Task authority 读取持久字段、stored references 与直接关系。列表 MUST NOT 读取 filesystem registry 或调用 Git、Worktree、OpenSpec Change resolver、Development、Review、Verification 或 Finish reader；实时引用可用性 MUST 只在具体详情入口解析。

#### Scenario: 数百条 Task 中读取一批
- **WHEN** Workspace 包含数百个 Task 和 stored Change references，调用方请求 50 条分页结果
- **THEN** repository MUST 只对当前批次执行有限批量参数化查询与组装
- **AND** Application MUST NOT 按 Task 或 Change reference 执行实时当前性解析

#### Scenario: 列表返回 stored Change reference
- **WHEN** 当前批次 Task 保存了 `project/change` reference
- **THEN** projection MUST 原样返回 stored reference，使 Buildr Web 能构造详情链接
- **AND** 列表 MUST NOT 声称该引用当前 available、active、archived 或来自 matching Worktree
