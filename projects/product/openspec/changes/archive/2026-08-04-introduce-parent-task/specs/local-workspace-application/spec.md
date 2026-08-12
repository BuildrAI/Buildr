## ADDED Requirements

### Requirement: Local App 必须动态投影和维护 Parent Task 层级
Local App Task 列表与详情 MUST 通过 Task Record Application read model 展示直接 Parent/Children；active Task 的创建与编辑 MUST 允许选择或清除合法 Parent，并 MUST 复用 expected `recordDigest` 冲突边界。

#### Scenario: 查看协调 Task
- **WHEN** 用户打开拥有直接 Children 的 Task 详情
- **THEN** 页面 MUST 展示可导航的直接 Child 列表及每个 Child 的真实 status
- **AND** MUST NOT 把 Child completed 自动显示为 Parent completed 或整体目标已满足

#### Scenario: 查看 Child Task
- **WHEN** 用户打开带 Parent 的 Child Task
- **THEN** 页面 MUST 展示可导航的 Parent identity、title 与真实 status
- **AND** MUST NOT 复制 Parent 的专业 Result 到 Child

#### Scenario: 编辑 Parent 发生冲突
- **WHEN** 页面读取后 Parent/Child 关系已被其他产品动作改变
- **THEN** mutation MUST 因 expected `recordDigest` 陈旧而 fail closed
- **AND** 页面 MUST 要求刷新而不是自动合并

#### Scenario: terminal Task 层级只读
- **WHEN** Task 已 completed 或 abandoned
- **THEN** 页面 MUST 保留 Parent/Children 投影并禁用关系 mutation
- **AND** MUST NOT 提供自动处置关联 Task 的按钮

