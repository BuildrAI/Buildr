## MODIFIED Requirements

### Requirement: Buildr Web Markdown 视图必须支持受控本地图片

Buildr Web Markdown renderer MUST 支持标准 Markdown 图片语法，并 MUST 只将由当前正文所属受控资源接口解析的本地相对图片转换为本机同源资源 URL；不受控图片路径 MUST NOT 绕过既有内容安全策略。文章图片 MUST 继续由文章资源 API 解析并保持原有路径限制；项目文档及任务材料 MUST 遵守 document-images 的当前正文、实际来源和范围约束。

#### Scenario: 渲染文章本地图片
- **WHEN** 文章正文包含 `![alt](assets/<filename>)` 且资源 API 能解析该文件
- **THEN** 文章详情 MUST 渲染同源图片并保留 alt 文本
- **AND** 图片 MUST 使用当前 Buildr Web 的资源 URL

#### Scenario: 不受控图片路径
- **WHEN** Markdown 图片为远程、绝对、反斜杠、越过其所属根或未通过当前正文受控映射，或文章图片路径包含 `..`
- **THEN** renderer MUST NOT 加载该图片
- **AND** 页面 MUST 保留安全文本或对应局部不可用提示

#### Scenario: 项目与任务材料图片
- **WHEN** 用户在项目文档、任务材料或由任务打开的项目文档中阅读合法本地图片
- **THEN** renderer MUST 使用对应主体和已观察正文/来源的同源图片接口
- **AND** MUST 保留当前阅读布局、原文切换与导航，不要求将普通图片登记为技术图
