## ADDED Requirements

### Requirement: Local App 必须提供独立文章入口

Local App MUST 在 Workspace 级应用外壳中提供独立的“文章”导航入口，并 MUST 提供文章列表页与文章详情页；文章页面 MUST 保持只读，不得提供文章编辑、发布或平台同步操作。

#### Scenario: 从工作空间导航打开文章

- **WHEN** 用户在已选定 Workspace 的 Local App 中点击“文章”
- **THEN** 应用 MUST 导航到该 Workspace scoped 的文章列表页
- **AND** 导航项 MUST 在文章列表或详情页保持 active 状态

#### Scenario: 打开文章详情

- **WHEN** 用户从文章列表选择一篇有效文章
- **THEN** 应用 MUST 展示文章标题、发布状态、发布目标和渲染后的 Markdown 正文
- **AND** 页面 MUST 提供返回文章列表的可用链接
- **AND** 页面 MUST NOT 提供修改文章正文或发布状态的写操作

### Requirement: Local App 必须从 canonical publication source 只读投影文章

Local App MUST 通过 Application read model 读取已登记 Workspace 中 Product Project 的 `docs/publications/` Markdown 文件；HTTP/Web MUST NOT 直接扫描任意 root/path、读取 SQLite 中的文章副本或创建第二份文章正文。

#### Scenario: 读取文章列表

- **WHEN** Local App 请求当前 Workspace 的文章列表
- **THEN** Application MUST 根据 registered Workspace 和 Product Project source 解析固定 publication root
- **AND** MUST 返回有效文章的稳定 ID、标题、类型、状态、发布日期和发布目标
- **AND** MUST 排除 `README.md`、隐藏文件和缺少有效文章 ID/标题的 Markdown 文件

#### Scenario: publication 目录不存在或为空

- **WHEN** Product Project 没有 `docs/publications/` 目录或目录中没有有效文章
- **THEN** API MUST 返回成功的空列表或明确的 `empty` read-model 状态
- **AND** Local App MUST 展示“暂无文章”空状态
- **AND** MUST NOT 阻塞工作空间、项目、服务、任务或变更页面

#### Scenario: 文章详情不存在

- **WHEN** 用户请求不存在或已移除的 publication ID
- **THEN** API MUST 返回稳定的 not-found 诊断
- **AND** Local App MUST 展示文章不可用状态及返回文章列表的链接

### Requirement: 文章读取必须保护 Workspace 与 publication 资源边界

文章列表、详情和图片资源 API MUST 只接受已登记 Workspace 身份、已发现的 publication ID 和固定目录内的合法相对资源名；MUST 拒绝任意 `target`、`root`、`path`、路径穿越、符号链接和固定 publication root 之外的文件。

#### Scenario: 拒绝任意文件系统路径

- **WHEN** 文章 API query 或 request body 携带 `target`、`root` 或 `path`
- **THEN** API MUST 返回明确的参数拒绝诊断
- **AND** MUST NOT 读取请求指定的文件系统位置

#### Scenario: 文章图片可安全读取

- **WHEN** 有效文章引用固定 publication root 下的 regular image file
- **THEN** API MUST 以对应图片 content type 返回该文件
- **AND** 响应 MUST 保持 no-store 并限制在 canonical publication root 内

#### Scenario: 文章图片越界或为符号链接

- **WHEN** 图片资源名包含路径穿越、指向 publication root 外部或解析为符号链接
- **THEN** API MUST 拒绝请求并返回明确诊断
- **AND** MUST NOT 返回文件内容

### Requirement: Local App Markdown 视图必须支持受控本地图片

Local App Markdown renderer MUST 支持标准 Markdown 图片语法，并 MUST 只将已由文章资源 API 解析的相对图片路径转换为本机同源资源 URL；不受控的图片路径 MUST NOT 绕过既有内容安全策略。

#### Scenario: 渲染文章本地图片

- **WHEN** 文章正文包含 `![alt](assets/<filename>)` 且资源 API 能解析该文件
- **THEN** 文章详情 MUST 渲染同源图片并保留 alt 文本
- **AND** 图片 MUST 使用当前 Local App 的资源 URL

#### Scenario: 不受控图片路径

- **WHEN** Markdown 图片路径为绝对路径、包含 `..`、反斜杠或未通过文章资源映射
- **THEN** renderer MUST NOT 加载该图片
- **AND** 页面 MUST 保留安全的文本或空内容表现
