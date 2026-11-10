## ADDED Requirements

### Requirement: 对话支持常见文档原件上传
系统 MUST 在现有附件入口支持 Markdown、PDF、Word（doc/docx）、Excel（xls/xlsx）、PowerPoint（ppt/pptx）、TXT、CSV、TSV、RTF、JSON、XML、YAML、日志及开放文档（odt/ods/odp）。选择、拖入与剪贴板文件 MUST 共用校验；每次最多9份附件，文档每份最多32 MiB，空文件及不支持类型 MUST 明确拒绝。文档 MUST 沿用当前草稿保存、移除、发送及历史读取边界，展示可辨识文件名。

#### Scenario: 新建及已有对话发送文档
- **WHEN** 用户添加有效文档并发送，或先刷新未发送草稿
- **THEN** 系统 MUST 保留文件名称、类型及原始字节，恢复或发送准确附件
- **AND** 消息与待发送区域 MUST 显示文档卡片而非损坏图片

#### Scenario: 大小与类型校验
- **WHEN** 文档为空、超过32 MiB、类型不支持或二进制文档签名明显不符
- **THEN** 系统 MUST 明确拒绝该材料且不发送执行

### Requirement: 文档材料以受控原件来源交付
系统 MUST 将文档准确原件路径、名称与类型交给当前执行者，MUST NOT 将文档装入图片输入，也 MUST NOT 自动执行、宏展开或声称已解析内容。文件名 MUST 仅作为元数据，MUST NOT 决定任意存储路径；所有读取 MUST 维持当前对话归属与文件安全校验。

#### Scenario: 文档与图片混合发送
- **WHEN** 同一次输入包含文档和图片
- **THEN** 图片 MUST 保持原生视觉输入，文档 MUST 通过单独的准确来源说明交付
- **AND** 智能体 MUST 被告知按当前权限和可用能力读取，无法读取时如实报告
