## MODIFIED Requirements

### Requirement: 每日演进 JSON 必须声明稳定 schema identity
Buildr 每日演进 CLI 与本机 HTTP 的 `--json` / JSON 响应 MUST 在顶层声明非空 `schemaVersion`，并为 record、inspect、list 与 Web 读取使用稳定 `buildr.<payload>/v<major>` identity。同一 major 内 MUST 只做兼容扩展。payload MUST 包含 Project、日期、日摘要四问、提交（作者、`authorship`、可选 Task 关联）、变更文件与未解析 Task 引用；MUST NOT 暴露本机绝对路径、SQLite 路径或 Git working tree path。Task 关联计数 MAY 为 0。

#### Scenario: Agent 读取 record JSON
- **WHEN** Agent 成功执行每日演进 `record --json`
- **THEN** 输出 MUST 是单一 JSON 对象并包含匹配的 `schemaVersion`
- **AND** MUST 报告 Project、日期、提交计数和 Task 关联计数

#### Scenario: inspect 包含未解析 Task
- **WHEN** 已保存文件引用的 Task 在读取时已不存在
- **THEN** JSON MUST 将该引用标为未解析
- **AND** MUST NOT 删除文件中的 Task ID
