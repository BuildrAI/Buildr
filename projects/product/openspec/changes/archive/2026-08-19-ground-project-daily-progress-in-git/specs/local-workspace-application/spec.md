## MODIFIED Requirements

### Requirement: 本机 HTTP 必须提供只读每日演进 API
Buildr Web Runtime MUST 提供 Project-scoped 与 Task-scoped 只读每日演进 API，在解析已登记 Workspace 后读取 `.buildr/daily-progress/` 中已保存 YAML，并解析本机 Task Record 摘要。API MUST 复用既有同源、session 与未知字段拒绝边界，MUST NOT 接受文件系统路径、MUST NOT 写入或删除演进文件，MUST NOT 创建 Task，也 MUST NOT 在 GET 时扫描 Git 或读取 `git config user.email`。

#### Scenario: 读取某 Project 某日演进
- **WHEN** 已认证请求读取已登记 Project 的存在日期
- **THEN** HTTP interface MUST 调用 Daily Progress Application inspect
- **AND** 响应 MUST 包含日摘要、提交、变更文件与可导航 Task 摘要

#### Scenario: 按 Task 反查
- **WHEN** 已认证请求读取某 Task 关联的每日演进
- **THEN** API MUST 只返回本机文件中引用该 Task ID 的提交或摘要条目
- **AND** MUST NOT 扫描 Git 或合成不存在的日期文件
