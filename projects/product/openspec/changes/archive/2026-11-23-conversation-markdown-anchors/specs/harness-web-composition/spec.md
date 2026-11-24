## ADDED Requirements

### Requirement: 对话中的本机 Markdown 章节链接打开原文并定位

Buildr Web 与独立 Harness 网页 MUST 将本机 `.md` 或 `.markdown` 链接的非空章节锚点从读取路径分离，沿用已核验的文件来源和权限。预览 MUST 显示文件并在标题锚点匹配时定位；标题不存在时 MUST 仍显示文件。合法 `#L<行号>` MUST 保持行号语义，原样工具文件路径与 `file:` URL 文件名中编码的 `#` MUST NOT 被误作章节。

#### Scenario: 预览对话里的中文 Markdown 章节

- **WHEN** 用户点击 `skills/references/naming-rules.md#前缀选择` 或其百分号编码锚点形式，源文件可读
- **THEN** 系统 MUST 读取无锚点的原文件，显示 Markdown 预览并尝试定位到标题「前缀选择」
- **AND** 即使找不到该标题，也 MUST 显示原文件而不报文件不存在

#### Scenario: 保留 Markdown 行号和字面文件名

- **WHEN** 用户点击 `notes.md#L7`，或打开文件名本来包含 `#` 的原样路径或 `file:` URL 编码路径
- **THEN** 系统 MUST 分别定位第 7 行或读取含有 `#` 的真实文件
