## ADDED Requirements

### Requirement: Task 说明必须由记录字段提供正文
Buildr Web MUST 在任务详情的说明节点，通过任务记录应用读取 Task Record.brief 的真实 Markdown 正文，MUST NOT 以 OpenSpec Change、intent 或聊天作为唯一说明来源。Task title、intent、范围和其他专业事实 MUST 保持各自可读。任务可以关联零到多个 Change，变更说明（Change Brief）MUST 作为具体规范变化的辅助阅读来源；旧任务 brief 为空时 MUST 显示真实缺失并在方案辅助来源保留 Change Brief 只读入口，不将其作为任务正文，不合并多个 Brief，也不选主 Change。

#### Scenario: 查看含 Brief 的关联 Change
- **WHEN** 用户打开含有可解析 Change 引用且该 Change 提供 Brief 的任务
- **THEN** 页面 MUST 保留该 Change Brief 原文和 Change identity 的只读阅读入口，并与独立任务说明区分
- **AND** 页面 MUST 提供从当前 Task 进入该 Change 技术 artifacts 的 Task-scoped 链接

#### Scenario: 一个 Task 关联多个 Change
- **WHEN** Task Record 保存多个 Change 引用
- **THEN** 页面 MUST 按每个已保存引用分别提供可用 Change Brief 或其不可用状态，独立说明节点仍读取唯一 Task Brief
- **AND** 页面 MUST NOT 推断、标记或合并任一“主 Change”，也不得用旧 Brief 覆盖记录 brief

#### Scenario: Brief 或关联 Change 不可用
- **WHEN** 已保存的 Change 引用无法解析，或可解析 Change 没有 Brief
- **THEN** 页面 MUST 展示该引用的真实 unavailable 状态
- **AND** Task 的 title、intent、独立材料和其他可用事实 MUST 继续可读
- **AND** 页面 MUST NOT 生成、保存、推断或从全局目录查找 Brief

#### Scenario: Task 没有关联 Change
- **WHEN** Task Record 没有 Change 引用
- **THEN** 页面 MUST 显示明确的无关联 Change 状态，并直接读取记录 brief，其他正式任务材料按需读取
- **AND** 页面 MUST NOT 扫描 Workspace、Project 或 Worktree 以发现 Change，也不得因空 `changes` 而跳过说明读取

#### Scenario: 已有关联说明当前不可读
- **WHEN** 任务记录 brief 为空或详情读取失败
- **THEN** 页面 MUST 如实显示未填写或记录读取失败，不依赖文件来源诊断
- **AND** MUST NOT 自动改用 Change Brief、intent 或其他同名文档伪装说明已齐备

## REMOVED Requirements

### Requirement: Task 说明必须由独立材料引用提供正文
**Reason**: 任务说明已迁入 Task Record.brief，文件关联不再作为说明权威。
**Migration**: 显式导入已关联的旧独立正文并保留原文件；通过记录读取说明。
