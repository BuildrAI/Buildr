## MODIFIED Requirements

### Requirement: Buildr Web 必须提供独立文章入口

Buildr Web MUST 在 Workspace 级工作空间区域左侧提供独立的“文章”导航入口，并 MUST 提供文章列表页与文章详情页；文章页面 MUST 支持受控新建、编辑、删除确认及资源引用；外部平台发布与同步仍需独立授权和真实能力。

#### Scenario: 从工作空间导航打开文章

- **WHEN** 用户在已选定 Workspace 的 Buildr Web 中点击“文章”
- **THEN** 应用 MUST 导航到该 Workspace scoped 的文章列表页
- **AND** 导航项 MUST 在文章列表或详情页保持 active 状态

#### Scenario: 打开文章详情

- **WHEN** 用户从文章列表选择一篇有效文章
- **THEN** 应用 MUST 展示文章标题、发布状态、发布目标和渲染后的 Markdown 正文
- **AND** 页面 MUST 提供返回文章列表的可用链接
- **AND** 页面 MUST 提供基于当前版本的正文与稿件状态编辑，并将平台发布记录与当前稿件分开表达

#### Scenario: 阅读与列表往返
- **WHEN** 用户搜索、按项目或稿件状态筛选、收藏文章并打开阅读页后返回
- **THEN** 页面 MUST 保留原列表条件，以工作空间、项目和文章标识识别同一资料
- **AND** MUST 提供正文目录、原文、导出、资源及相关材料的阅读入口

#### Scenario: 智能体写作交接
- **WHEN** 用户准备起草、润色、审校或平台改写请求
- **THEN** 页面 MUST 携带真实项目、文章和当前来源版本，并明确仅准备请求、尚未执行
- **AND** 用户修改目标或材料后 MUST 重新准备请求，不得复制旧目标的结果


### Requirement: Buildr Web 必须从 canonical publication source 只读投影文章

Buildr Web MUST 通过 Application read model 读取已登记 Workspace 中可读取受控项目的 `docs/publications/` Markdown 文件；HTTP/Web MUST NOT 直接扫描任意 root/path、读取 SQLite 中的文章副本或创建第二份文章正文。

#### Scenario: 读取文章列表

- **WHEN** Buildr Web 请求当前 Workspace 的文章列表
- **THEN** Application MUST 根据 registered Workspace 和每个明确 Project source 解析固定 publication root
- **AND** MUST 返回有效文章的项目标识、稳定 ID、标题、摘要、类型、稿件状态、发布日期、更新时间、当前版本和发布目标
- **AND** MUST 排除 `README.md`、隐藏文件和缺少有效文章 ID/标题的 Markdown 文件

#### Scenario: publication 目录不存在或为空

- **WHEN** 一个受控 Project 没有 `docs/publications/` 目录或目录中没有有效文章
- **THEN** API MUST 返回成功的空列表或明确的 `empty` read-model 状态
- **AND** Buildr Web MUST 展示“暂无文章”空状态
- **AND** MUST NOT 阻塞工作空间、项目、服务、任务或变更页面

#### Scenario: 文章详情不存在

- **WHEN** 用户请求不存在或已移除的 publication ID
- **THEN** API MUST 返回稳定的 not-found 诊断
- **AND** Buildr Web MUST 展示文章不可用状态及返回文章列表的链接

#### Scenario: 相同文章标识存在于两个项目
- **WHEN** 两个项目各自维护相同 publication ID
- **THEN** 列表、详情、编辑、资源和收藏 MUST 按项目与文章的组合身份区分
- **AND** 旧 `/publications/:id` 和旧文章页面地址 MUST 继续解析 Product 项目，不猜测其他项目

#### Scenario: 单个项目不可读取
- **WHEN** 一个项目不在受控范围或来源暂时不可读
- **THEN** 聚合目录 MUST 表达该项目局部诊断，其余可读取项目继续提供内容


### Requirement: 文章读取必须保护 Workspace 与 publication 资源边界

文章列表、详情和资源 API MUST 只接受已登记 Workspace 身份、合法项目及已发现的 publication ID 和固定目录内的合法相对资源名；MUST 拒绝任意 `target`、`root`、`path`、路径穿越、符号链接和固定 publication root 之外的文件。

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

#### Scenario: 下载文章附件
- **WHEN** 有效文章引用 `assets/` 下允许类型的普通附件
- **THEN** API MUST 按受控类型返回文件，并以下载方式提供非图片附件
- **AND** HTML、脚本及其他可执行内容 MUST NOT 以内联文档执行


## ADDED Requirements

### Requirement: 文章修改必须使用当前项目文件版本
文章新建、更新和删除 MUST 写入已登记受控项目的 `docs/publications/`；读取 MUST 零写入。更新和删除 MUST 校验当前文章版本，保留未修改的前置元数据（Front Matter）和平台发布记录，不创建数据库正文副本。所有 HTTP 写入 MUST 复用本机会话、同源及有界请求检查。

#### Scenario: 创建和修改文章
- **WHEN** 用户在明确项目中新建或基于当前 revision 保存合法标题、摘要、正文和稿件状态
- **THEN** 应用 MUST 返回实际保存的同一文章及新 revision，重新打开仍可读取
- **AND** 既有 `id`、平台记录和非本次修改的元数据 MUST 保留

#### Scenario: 外部修改发生冲突
- **WHEN** 文件已被其他入口修改，而保存或删除使用旧 revision
- **THEN** 应用 MUST 拒绝覆盖，页面 MUST 保留用户输入并允许读取最新稿件比较

#### Scenario: 删除含共享资源的文章
- **WHEN** 用户确认删除当前版本的文章
- **THEN** 应用 MUST 只删除该文章，MUST NOT 自动删除同目录资源或外部发布内容

### Requirement: 编辑器必须管理文章的本地资源与引用
编辑器 MUST 展示当前文章引用的图片与附件，并能浏览所属项目 `docs/publications/assets/` 的资源。上传 MUST 使用明确文章身份和 revision，生成不覆盖已有文件的名称；成功后 MUST 返回真实相对路径，可插入图片或附件 Markdown 引用。上传成功与正文保存 MUST 分别表达。

#### Scenario: 编辑已有图片文章
- **WHEN** 用户打开含 `![alt](assets/name.webp)` 的既有文章
- **THEN** 编辑器和阅读页 MUST 展示该图片与路径，保存未修改正文后引用 MUST 仍可使用

#### Scenario: 上传并插入图片和附件
- **WHEN** 用户上传允许类型和体积内的图片或附件
- **THEN** 文件 MUST 写入所属项目固定 `assets/` 目录，返回唯一相对名称，页面 MUST 可预览或下载并插入正确引用
- **AND** 同名文件 MUST NOT 被静默覆盖；未插入或未保存正文 MUST NOT 被表示为引用已保存

#### Scenario: 不安全的资源输入
- **WHEN** 上传或读取包含路径穿越、符号链接、未允许类型、伪造图片或超限内容
- **THEN** 操作 MUST 局部拒绝并保留已有文章与资源，其余阅读仍可用
