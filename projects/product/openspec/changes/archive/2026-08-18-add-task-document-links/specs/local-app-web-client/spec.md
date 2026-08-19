## ADDED Requirements

### Requirement: Task Intent 必须支持可点击的 Project 文档引用
Buildr Web MUST 以受限 Markdown 展示 Task Intent，并 MUST 允许用户点击指向当前 Task scope 内已登记 Project 的 Workspace 相对 `.md` 路径，在 Task 上下文中打开只读文档预览。客户端 MUST 根据 Project registry 的真实 source path 解析引用并复用 Project Document API；MUST NOT 从目录命名猜测 Project、读取绝对路径或获得任意 Workspace 文件访问能力。

#### Scenario: 查看任务引用的架构文档
- **WHEN** Task Intent 包含一个带用户可读名称、且路径位于 Task scope 内已登记 Project 的 Markdown 链接
- **THEN** 页面 MUST 将名称显示为可点击链接
- **AND** 点击后 MUST 展示文档正文、文档名称和 Project 相对路径

#### Scenario: 文档引用不可用
- **WHEN** Intent 链接不是 `.md`、不属于 Task scope 内已登记 Project、文件缺失或路径越界
- **THEN** 页面 MUST 显示明确的不可用提示
- **AND** MUST NOT 扫描 Workspace、改写 Intent 或尝试读取其他路径

#### Scenario: 继续浏览同一 Project 内的 Markdown 文档
- **WHEN** 用户在 Task 文档预览中点击当前文档的相对 `.md` 链接
- **THEN** 页面 MUST 使用同一 Project Document API 打开解析后的 Project 内文档
- **AND** 越出 Project 或非 Markdown 的链接 MUST 被拒绝

#### Scenario: Intent 仍由 Task Record 管理
- **WHEN** 用户编辑或读取含 Markdown 文档引用的 Intent
- **THEN** Task Record MUST 继续只保存原有 intent 字符串并保持既有 optimistic concurrency 与搜索语义
- **AND** 系统 MUST NOT 新增附件状态、Planning gate 或第二 Task writer
