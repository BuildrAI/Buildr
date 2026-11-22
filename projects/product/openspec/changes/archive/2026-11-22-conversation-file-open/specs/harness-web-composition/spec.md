## MODIFIED Requirements

### Requirement: 对话中的本机 HTML 章节链接支持隔离预览

系统 MUST 将本机 `.html` 或 `.htm` 文件链接的非空章节锚点与读取路径分开。打开时 MUST 沿用既有的来源解析、权限检查及隔离策略，且仅将锚点附加到获准的 HTML 预览地址。有无锚点均默认就地隔离预览。

#### Scenario: 打开对话中链接指向的 HTML 章节

- **WHEN** 用户在 Buildr Web 或独立 Harness 网页对话中打开可读的 `report.html#skills`
- **THEN** 系统 MUST 读取 `report.html` 而不是 `report.html#skills`
- **AND** 预览及新标签页 MUST 保留 `#skills`，如章节不存在仍显示报告

#### Scenario: 保留已有文件引用语义

- **WHEN** 用户打开原样工具文件路径、不带章节的普通文件链接，或非 HTML 代码行号链接
- **THEN** 系统 MUST 不将文件名中的 `#` 或非 HTML 代码行号误作 HTML 章节

## ADDED Requirements

### Requirement: 对话文件链接默认就地预览并可定位资源管理器

两种对话入口 MUST 共用链接位置解析并默认在对话中预览。合法行号 MUST 在预览中定位；原样文件路径不得误拆。仅为当前资源管理器可定位的准确文件 MUST 在短暂停留后提供「在资源管理器中打开」，键盘和触屏也可调用。所有动作 MUST 沿用原有权限，不自动登记目录。

#### Scenario: 预览文件行号
- **WHEN** 用户点击 `AGENTS.project.md#L7`
- **THEN** 系统 MUST 预览同一文件并定位第 7 行，不切换页面

#### Scenario: 在资源管理器中打开同一文件
- **WHEN** 用户选择可用的「在资源管理器中打开」
- **THEN** 资源管理器 MUST 展开父目录、选中并读取该文件；对话草稿与阅读位置保持

#### Scenario: 工作范围外的文件
- **WHEN** 文件可预览但不能在当前资源管理器定位
- **THEN** 系统 MUST 不提供资源管理器动作，普通点击仍按原权限预览
