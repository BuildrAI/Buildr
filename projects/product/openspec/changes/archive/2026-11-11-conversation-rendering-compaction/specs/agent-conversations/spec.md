## RENAMED Requirements

- FROM: `### Requirement: 对话链接必须按Markdown目的地解析后访问`
- TO: `### Requirement: 对话链接必须按Markdown目的地安全解析后访问`

## MODIFIED Requirements

### Requirement: 对话链接必须按Markdown目的地安全解析后访问

Markdown文件链接的角括号 MUST 作为目的地语法处理，传给来源解析及打开回调的路径 MUST 不含语法包裹。系统 MUST 保留空格、编码、合法行号或锚点的准确含义，并继续拒绝危险方案、不完整包裹及非法来源。本地绝对链接，包括 `file://` 目的地，MUST 解码为文件系统路径后复用当前对话工作空间、已登记代码库及既有文件读取的来源校验；`file://` 只接受空主机或 `localhost`，其他主机 MUST 拒绝。跳转前 MUST 核实目标文件，MUST NOT 为无效目标自动展开多级错误父目录，MUST NOT 借本地链接读取来源边界之外的任意文件。

安全可访问的本地文件链接 MUST 渲染为可点击链接，点击 MUST 打开同一准确路径及合法行号。目标越界、缺失、不可读或来源无法确认时，系统 MUST 仍渲染链接文字并显示可复制的原始路径及局部原因，MUST NOT 显示原始 Markdown 源文或静默删除整段内容。危险方案、不完整包裹、非法编码及非本地 `file://` 主机 MUST 保持安全边界并局部说明，MUST NOT 通过剥离语法绕过校验。

#### Scenario: 角括号包裹路径
- **WHEN** 答复含 `[记录](<.buildr/local/记录 文档.md>)`
- **THEN** 回调 MUST 收到 `.buildr/local/记录 文档.md`，预览及打开使用此准确路径

#### Scenario: 本地文件链接正常呈现
- **WHEN** 答复含 `[查看 help 完整内容](file:///tmp/buildr-api-docs/help.md)`
- **THEN** 信息流 MUST 渲染“查看 help 完整内容”链接文字，不得显示原始 Markdown 语法
- **AND** 目标在已登记来源内时 MUST 打开同一路径；目标越界或缺失时 MUST 显示可复制路径及具体原因

#### Scenario: 非法目的地
- **WHEN** 包裹不完整、目的地使用 `javascript:`、`data:` 等危险方案、`file://` 使用非本地主机或来源校验失败
- **THEN** 系统 MUST 保持安全边界并局部说明，MUST NOT 通过剥离语法绕过校验
