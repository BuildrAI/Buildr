## ADDED Requirements

### Requirement: 对话中的本机 HTML 章节链接支持隔离预览

系统 MUST 将本机 `.html` 或 `.htm` 文件链接的非空章节锚点与读取路径分开。打开时 MUST 沿用既有的来源解析、权限检查及隔离策略，且仅将锚点附加到获准的 HTML 预览地址。Buildr Web 中带锚点的 HTML 链接使用隔离预览；不带锚点的已登记代码库文件继续优先在代码浏览器打开。

#### Scenario: 打开对话中链接指向的 HTML 章节

- **WHEN** 用户在 Buildr Web 或独立 Harness 网页对话中打开可读的 `report.html#skills`
- **THEN** 系统 MUST 读取 `report.html` 而不是 `report.html#skills`
- **AND** 预览及新标签页 MUST 保留 `#skills`，如章节不存在仍显示报告

#### Scenario: 保留已有文件引用语义

- **WHEN** 用户打开原样工具文件路径、不带章节的普通文件链接，或非 HTML 代码行号链接
- **THEN** 系统 MUST 保留已有打开方式，不将文件名中的 `#` 或非 HTML 代码行号误作 HTML 章节
