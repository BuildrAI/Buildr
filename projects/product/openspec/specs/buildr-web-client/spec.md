# buildr-web-client Specification

## Purpose

Buildr Web React 客户端源码位置、构建产物、本机 session adapter 与公共 API client 边界，以及与现网路由等价的行为完整性约束。

## Requirements

### Requirement: Buildr Web 必须提供可扩展的 React Web 客户端并保持行为等价
Buildr Web 客户端 MUST 以 React 实现，源码 MUST 位于 `product/buildr-web` Service 的前端工程根，并 MUST 通过构建产物由本机 Buildr Web HTTP interface（归属 `product/buildr`）同源托管。用户可观察的**已挂载路由 path 与功能交互** MUST 保持等价，包括工作空间列表、开始/设置、任务列表与详情页签、Task-scoped Change、项目、服务、文章、Agent Action 抽屉、退出应用与 preview 身份条；视觉呈现、布局密度与动效 MAY 在经确认的 UI 重设计范围内变化，且 MUST NOT 被解释为对路由或功能交互等价的破坏。客户端 MUST NOT 直连 SQLite、manifest 或文件系统 path，MUST NOT create Task，也 MUST NOT 在页面内执行专业任务。

#### Scenario: 生产托管 React shell
- **WHEN** 用户通过 `buildr web`、已安装 npm CLI 启动的本机应用或官方/开发 launcher 打开 Buildr Web
- **THEN** HTTP interface MUST 返回来自构建产物的应用 shell
- **AND** 页面 MUST 成功读取注入的本机 session meta 并加载同源静态资源

#### Scenario: 路由行为等价
- **WHEN** 用户访问既有 Workspace 深链或全局路由
- **THEN** React 客户端 MUST 渲染对应功能视图
- **AND** MUST NOT 要求用户学习新的 URL 方案作为 UI 重设计条件

#### Scenario: 产品边界保持
- **WHEN** 用户在 React Buildr Web 中操作 Task、Project、Service 或 Agent Action
- **THEN** 页面 MUST 继续只维护允许的低风险 metadata 或生成 Agent prompt
- **AND** MUST NOT 创造第二套 Task writer 或绕过 Application

#### Scenario: 前端源码根位于 buildr-web
- **WHEN** 维护者检查 Buildr Web React 源码位置
- **THEN** 权威源码根 MUST 为 `projects/product/services/buildr-web`
- **AND** MUST NOT 将 `projects/product/services/buildr/web` 继续作为权威前端源

#### Scenario: 视觉重设计不改变功能交互契约
- **WHEN** Buildr Web 完成经确认范围的视觉/布局/动效重设计
- **THEN** 既有功能步骤（打开工作空间、浏览项目/服务/文章、查看任务与 Agent Action）MUST 仍可在相同路由 path 下完成
- **AND** MUST NOT 以外观或 class 名变化为由要求新的 API、session 或产品能力

### Requirement: Buildr Web 客户端必须分离公共 API client 与本机 session adapter
Buildr Web 客户端 MUST 将 HTTP JSON 调用封装为不依赖 DOM 的公共 API client，并 MUST 通过本机 session adapter 为写请求提供 `x-buildr-session`（及其他本机写保护所需信息）。公共 API client MUST 可在不绑定本机 meta session 的情况下描述请求形状，以便未来云端 auth adapter 替换；本能力 MUST NOT 实现云端认证、跨 Origin 写 API 或远程托管部署。

#### Scenario: 本机写请求使用 session adapter
- **WHEN** React 客户端发起写请求
- **THEN** 请求 MUST 经本机 session adapter 附带有效 session，并保持与当前应用 Origin 同源
- **AND** 缺少有效 session 或 Origin 不匹配时 MUST 在 Application mutation 前失败

#### Scenario: 云端扩展点不在本能力交付
- **WHEN** 维护者审查本能力的客户端分层
- **THEN** 设计与实现 MUST 保留可替换的 auth/session adapter 边界
- **AND** MUST NOT 交付云端登录、分域 CORS 写路径或远程静态托管作为本 Change 的完成条件

### Requirement: Buildr Web 构建产物必须可在无开发前端工具链的环境中被服务
Buildr MUST 将 Buildr Web 的发布所需文件定义为 `buildr` 内构建产物目录中的静态资产（由 `buildr-web` 构建输出消费而来）。运行 `buildr web`、launcher 或已安装 npm package 时，主机 MUST NOT 要求存在 Vite 开发服务器、可写的 `buildr-web` 前端源工程，即可托管并打开 Buildr Web。

#### Scenario: 无 Vite 开发服务器仍可打开
- **WHEN** 环境仅有已构建的 web dist 与 Buildr CLI/runtime
- **THEN** Buildr Web MUST 仍可通过 loopback HTTP 打开并完成 shell 级导航
- **AND** MUST NOT 依赖 `buildr-web` 源码目录中的开发依赖在运行时可用

### Requirement: Buildr Web 必须只提交显式协调动作
Buildr Web MUST只通过Task Record Application提交用户明确触发的关系更新、普通任务完成或带完整验收与授权的父任务完成；不得自动创建、完成或abandon Child，不得自动改写Change，也不得维护Parent Plan reconciliation。

#### Scenario: 用户确认Parent reconciliation
- **WHEN** 用户基于current Task Record与父子快照提交完整验收和明确授权
- **THEN** UI MUST展示Application实际结果或冲突
- **AND** 后续Child专业动作与状态 MUST保持独立

### Requirement: Buildr Web UI 重设计必须遵守离线 CSP 与生产托管边界
Buildr Web UI 重设计 MUST 仅修改 `product/buildr-web` 内的视觉、布局与动效实现，MUST 继续由 `product/buildr` 消费构建产物目录 `web-dist` 做同源托管，并 MUST 遵守既有离线 CSP：不得引入 CDN、远程字体或远程脚本。若使用自定义字体，字体文件 MUST 作为同源静态资产随构建产物提供。正式完成证据 MUST 来自 `buildr web`（或测试夹具中的等价 Buildr Web HTTP server）托管的构建产物，MUST NOT 将 Vite 开发服务器或 HMR 会话当作交付完成条件。

#### Scenario: 无远程字体或脚本
- **WHEN** 维护者审查重设计后的前端构建产物与 HTML 入口
- **THEN** 产物 MUST NOT 引用 CDN、googleapis 或其他远程字体/脚本主机
- **AND** 自定义字体（若有）MUST 仅通过同源 URL 加载

#### Scenario: 生产托管验收
- **WHEN** Task 或 Candidate 宣称 UI 重设计完成
- **THEN** 验收 MUST 在生产托管的 `web-dist` 上执行适用的 browser smoke 或 affected selector
- **AND** MUST NOT 仅以 Vite HMR 预览截图或开发服务器会话作为完成证据

### Requirement: Buildr Web 必须区分待办与正式执行 Task
Buildr Web Task 列表 MUST 默认使用 `open` 过滤，并 MUST 提供 `open`、`todo`、`active`、`completed`、`abandoned`、`all` 封闭选项及明确中文标签。页面 MUST 显示每条记录的真实 status，且 MUST NOT提供 todo 创建或激活入口。

#### Scenario: 默认进入 Task 列表
- **WHEN** 用户打开 Workspace Task 页面且未提供 status query
- **THEN** 页面 MUST 请求并显示 todo 与 active Task
- **AND** completed 与 abandoned MUST 仅在用户选择对应过滤时显示

#### Scenario: 查看 todo Task
- **WHEN** 用户打开 todo Task 详情
- **THEN** 页面 MUST 允许编辑顶层字段、无变更完成或放弃，并说明尚未进入正式执行
- **AND** Environment、Development 与 Finish 视图 MUST 不伪造任何占位事实

### Requirement: Buildr Web 必须在全局壳层展示 GA 与 RC 更新
Buildr Web React 客户端 MUST 在全局顶部消费 Release Awareness API并展示 GA/RC 更新提示；提示 MUST 在全局与 Workspace 路由保持一致，不得由各页面重复实现。

#### Scenario: RC 可更新
- **WHEN** candidate 轨道高于当前安装
- **THEN** 全局提示 MUST显示当前版本与 RC 候选版本
- **AND** MUST提供复制 `buildr update --track candidate` 或交给 Agent 的动作

#### Scenario: GA 已发布且当前为 RC
- **WHEN** stable 轨道存在高于当前 prerelease 的 GA 版本
- **THEN** 全局提示 MUST说明 GA 已发布并提供 `buildr update --track stable`

#### Scenario: 用户处理提示
- **WHEN** 用户选择复制命令或交给 Agent
- **THEN** 客户端 MUST只生成或复制明确轨道的命令/prompt
- **AND** MUST NOT直接调用 npm 或创建 Workspace Task

#### Scenario: 无更新或查询失败
- **WHEN** 两个轨道都没有更高版本或 Release Awareness 暂不可用
- **THEN** 客户端 MUST不阻断主导航与页面内容

### Requirement: Buildr Web 壳层必须采用上下结构
Buildr Web App Shell MUST 在顶部提供品牌、共同工作空间范围、“工作台”和“工作空间”两个区域及交给 Agent 操作，工作台 MUST 排在工作空间之前。选定范围的两个区域 MUST 共享相同 workspaceId。工作台 MUST 提供概览、任务与动态入口；工作空间 MUST 使用常驻左侧导航承载项目、服务、代码库、技能、文章和设置六个平级入口，导航标签 MUST 使用中文，六个入口 MUST 采用一致的行式呈现（图标 + 文案、相同行高），MUST NOT 在左侧导航内展开项目树或所属服务列表。项目详情与服务详情 MUST 保留右上角编辑入口；视觉 token、Ant Design 5 与离线 CSP 边界 MUST 保持既有约束。

工作空间区域的内容区 MUST 采用双栏组页签模型：
- 左组 MUST 仅为项目主页及同项目知识提供可复用的主标签；目录由菜单定位，不重复显示主标签。服务、代码库、技能、文章及服务知识 MUST 使用副屏；主标签支持关闭并保留同工作空间现场，全部关闭回项目目录。
- 右组 MUST 提供对象级页签条：在项目全景或服务全景内点开文档、变更等对象时，MUST 在右组以页签就地展开，MUST NOT 跳离当前领域页面；右组页签全部关闭时右组 MUST 退场，左组恢复独占。
- 两组之间 MUST 为贯连的分隔线，MUST 支持拖拽调整右组宽度；两组的页签条在分隔线处 MUST 视觉连通；两组内容区 MUST 各自独立滚动。
- 左组内容 MUST 限宽居中；宽度 MUST 随可用窗口自适应并设上限；右组打开且没有已保存手动比例时，左右两组 MUST 均分信息区可用宽度（不含左侧导航及中间分隔线）；已保存手动比例时 MUST 优先恢复该比例。
- 修改项目、修改服务与交给 Agent 等动作 MUST 统一在抽屉层完成，抽屉 MUST 采用一致的壳结构（标识行、标题、副标题、关闭与底部状态区）。
- 壳层与内容区 MUST 使用统一的白底，不得以不同区域底色分割主要分区。

#### Scenario: 顶栏承载主导航
- **WHEN** 用户在选定 Workspace 中切换工作台和工作空间
- **THEN** 顶部 MUST 依次呈现“工作台”“工作空间”，保持同一工作空间范围
- **AND** 工作台 MUST 默认展示日常概览，并保留任务与动态入口；工作空间 MUST 展示工作空间内容
- **AND** 主菜单 MUST NOT 展示环境维护分组或智能体配置入口

#### Scenario: 进入 Workspace 直接打开任务列表
- **WHEN** 用户进入可用 Workspace、点击品牌或切换工作空间
- **THEN** MUST 打开该 Workspace 的工作概览并选中工作台
- **AND** `/workspaces/:workspaceId/` MUST 重定向到工作概览，`/workspaces/:workspaceId/overview` MUST 直接展示概览；既有 `/tasks` 深链保持

#### Scenario: 平级领域导航
- **WHEN** 用户查看工作空间左侧导航
- **THEN** MUST 呈现项目、服务、代码库、技能、文章、设置六个平级入口，行式一致
- **AND** MUST NOT 在导航内展开项目树或项目所属服务列表
- **AND** 当前领域入口 MUST 有可辨认的选中态

#### Scenario: 页面级页签生命周期
- **WHEN** 用户从项目目录进入项目主页
- **THEN** 左组 MUST 追加或激活同一项目主标签，目录不新增可见主标签
- **AND** 点击既有标签 MUST 恢复对应页面现场，关闭全部主标签 MUST 返回项目目录
- **AND** 页面级标签集合 MUST 在同一工作空间内跨页面保持

#### Scenario: 项目与服务上下文导航
- **WHEN** 用户从项目目录或服务目录选择项目或服务
- **THEN** 项目 MUST 打开可复用主标签，服务 MUST 使用同类复用副屏并保留目录
- **AND** 左侧导航 MUST 保持平级入口且正确标记当前领域，不展开项目树或所属服务列表

#### Scenario: 独立展开与折叠
- **WHEN** 用户在全景内点开或关闭某个文档、变更对象
- **THEN** MUST 只在右组打开或关闭对应对象页签，不跳转当前页面
- **AND** 关闭对象页签 MUST NOT 影响左组全景的选中与滚动状态
- **AND** 页签与关闭控件 MUST 支持键盘操作并提供可访问名称

#### Scenario: 领域内对象在右组就地展开
- **WHEN** 用户在项目主页打开文档或服务，或在服务副屏打开文档与变更
- **THEN** 主屏项目或目录 MUST 保持；项目文档在右组标签展示，服务下级资料在原副屏位置阅读且可返回
- **AND** 关闭全部右组标签 MUST 恢复主区域，不新增第三分屏

#### Scenario: 贯连分隔线可调宽
- **WHEN** 右组存在且用户拖拽两组之间的分隔线
- **THEN** 右组宽度 MUST 随拖拽在允许区间内调整
- **AND** 分隔线 MUST 贯通内容区高度，并在页签条高度处与两条页签条视觉连通
- **AND** 悬停与拖拽时分隔线 MUST 有可辨认的强调态

#### Scenario: 详情保持通栏
- **WHEN** 用户从服务或文章目录进入详情
- **THEN** 详情 MUST 在副屏展示并保留来源目录；展开阅读时复用同一详情内容
- **AND** 当前区域的左侧导航 MUST 保持可达

#### Scenario: 项目与服务路由保持
- **WHEN** 用户通过 URL 直接访问项目或服务的详情及编辑地址
- **THEN** MUST 保留既有 `/projects`、`/projects/:projectCode`、`/services`、服务详情及编辑路由
- **AND** MUST NOT 改变项目和服务的身份、归属或关联语义

#### Scenario: 项目新增入口
- **WHEN** 用户点击项目目录的创建入口
- **THEN** MUST 打开既有项目创建指令交互（抽屉），不直接创建源资产

#### Scenario: 任务页宽屏并排列表与详情
- **WHEN** 用户在宽屏打开任务列表或详情
- **THEN** 工作台内容区 MUST 分别提供完整列表与独立详情，打开详情不得自动选择其他记录；返回 MUST 保留查询范围、分组与已浏览位置
- **AND** `/tasks` 与 `/tasks/:taskId` 路由 MUST 保持不变

#### Scenario: 任务页窄屏避免横向溢出
- **WHEN** viewport 宽度为 390px 且用户打开任务详情
- **THEN** 详情 MUST 可见并可操作
- **AND** 页面主容器 MUST NOT 横向溢出
- **AND** 任务列表与详情 MUST 各自可独立浏览；关联资料在宽屏并排阅读、空间不足时使用可关闭阅读层

#### Scenario: 项目页宽屏并排列表与详情
- **WHEN** 用户在宽屏打开项目目录或项目主页
- **THEN** 项目主页 MUST 使用可复用主标签，展示项目简介、工作入口、文章与知识、关联服务和项目资料
- **AND** 文档与服务 MUST 在副屏打开并保留主页
- **AND** `/projects` 与 `/projects/:projectCode` 路由 MUST 保持不变

#### Scenario: 项目页窄屏避免横向溢出
- **WHEN** viewport 宽度为 390px 且用户打开项目主页
- **THEN** 详情 MUST 可见可操作且主容器无横向溢出
- **AND** 副屏在并排空间不足时 MUST 使用可关闭阅读层，关闭恢复主内容

#### Scenario: 列表筛选保持一行
- **WHEN** 用户打开任务列表或项目、服务目录
- **THEN** 搜索与筛选控件 MUST 出现在标题下方的同一工具行
- **AND** MUST NOT 使用独立竖排筛选表单卡作为默认布局

#### Scenario: 服务菜单名称
- **WHEN** 用户查看工作空间导航
- **THEN** 服务集合入口 MUST 显示“服务”，继续使用原有 `/services` 路由
- **AND** 本次 MUST NOT 改变项目和服务的身份、归属或关联语义

#### Scenario: 窄屏降级
- **WHEN** 可用容器宽度不足以并排阅读且打开右组
- **THEN** 副屏 MUST 使用可关闭、可键盘返回的覆盖式阅读层，关闭后恢复原主屏
- **AND** viewport 宽度为 390px 时主要操作 MUST 可见，页面不得横向溢出

#### Scenario: 克制的视觉反馈
- **WHEN** 用户悬停、聚焦或操作导航、页签与分隔线
- **THEN** MUST 能辨认可操作目标与当前选择，正文阅读区域 MUST 保持清晰层级
- **AND** 减少动态效果偏好 MUST 被尊重，装饰动效 MUST NOT 延迟内容或阻止操作

#### Scenario: 工作空间浏览状态持续
- **WHEN** 用户拖动页面标签或分隔线后重新进入同一工作空间
- **THEN** 浏览器存储可用时 MUST 恢复该工作空间的标签顺序和手动分屏比例
- **AND** 其他工作空间 MUST 使用各自偏好，窗口缩放导致的临时尺寸修正 MUST NOT 覆盖保存的比例
- **AND** 存储不可用或内容损坏 MUST NOT 阻止浏览

#### Scenario: 保持已打开页面
- **WHEN** 用户切换已访问标签或暂时进入工作台再返回
- **THEN** 已打开页面 MUST 保留滚动、筛选、草稿和页面内容，不因切换清空页签栏或重复整页加载
- **AND** MUST NOT 按隐藏时长自动释放页面；显式关闭或切换工作空间 MAY 释放

#### Scenario: 标签拖动反馈
- **WHEN** 用户拖动页面标签调整顺序
- **THEN** 标签 MUST 跟随指针，相邻标签 MUST 平滑让位并在松手后落位，拖动 MUST NOT 触发页面切换
- **AND** MUST 支持键盘排序和关闭，减少动态效果偏好下 MUST 取消非必要动画

#### Scenario: 项目内服务直接打开主屏主页
- **WHEN** 用户在项目主页点击服务卡片或访问旧服务详情地址
- **THEN** MUST 按登记身份在副屏打开或复用服务详情，MUST NOT 新增服务主标签
- **AND** 项目主页及已有文档现场 MUST 保留；旧地址无法解析时 MUST 显示局部错误而不猜测身份

#### Scenario: 副分屏默认左右均分
- **WHEN** 用户没有保存手动比例并打开副分屏
- **THEN** 左右并排时两组 MUST 等宽，缩放窗口后仍 MUST 等宽
- **AND** 用户 MUST 可以拖动调整并保存工作空间（Workspace）比例；关闭全部副分屏标签后主屏 MUST 恢复全部信息区宽度

### Requirement: Task Intent 必须支持可点击的 Project 文档引用
Buildr Web MUST 以受限 Markdown 展示 Task Intent，并 MUST 允许用户点击指向当前 Task scope 内已登记 Project 的 Workspace 相对 `.md` 路径，在 Task 上下文中打开只读文档预览。客户端 MUST 根据 Project registry 的真实 source path 解析引用并复用任务范围文档接口选择当前工作树或保留项目根；MUST NOT 从目录命名猜测 Project、读取绝对路径或获得任意 Workspace 文件访问能力。

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
- **THEN** 页面 MUST 使用同一任务范围文档接口 打开解析后的 Project 内文档
- **AND** 越出 Project 或非 Markdown 的链接 MUST 被拒绝

#### Scenario: Intent 仍由 Task Record 管理
- **WHEN** 用户编辑或读取含 Markdown 文档引用的 Intent
- **THEN** Task Record MUST 继续只保存原有 intent 字符串并保持既有 optimistic concurrency 与搜索语义
- **AND** 系统 MUST NOT 新增附件状态、Planning gate 或第二 Task writer

### Requirement: 项目详情必须提供每日演进视图
Buildr Web 项目详情 MUST 提供“项目动态”入口并打开已筛选该项目的统一动态页面。完整每日演进 MUST 在动态页面按所选项目与日期展示，并 MUST 支持按日、按人、按任务切换。旧项目每日演进地址 MUST 转入统一动态页，有日期时保留该日期，无日期时沿用本机今天。视图 MUST 列出日摘要四问与提交列表，MUST NOT 列出变更文件；自己的已关联提交 MUST 提供可导航 Task，自己的未关联提交与他人提交 MUST 展示且无 Task 芯片。页面 MUST NOT 提供写入或编辑控件，生成或重跑 MUST 交给 Agent。日期控件 MUST 使用 DatePicker（`#progress-date`），MUST NOT 在 `#progress-body` 内放置 `input`/`textarea`。

#### Scenario: 打开有当天文件的项目
- **WHEN** 用户打开某 Project 的每日演进视图且当天 v2 文件存在
- **THEN** 页面 MUST 展示四问摘要与提交
- **AND** 页面 MUST NOT 展示变更文件列表或「变更文件」标题
- **AND** 切换按人/按任务 MUST 只改变分组，不修改文件、不扫描 Git

#### Scenario: 打开没有当天文件的项目
- **WHEN** 当天文件不存在
- **THEN** 页面 MUST 展示空态并说明由 Agent 生成
- **AND** MUST NOT 根据 Git 提交或任务列表自动填充

#### Scenario: 旧项目每日演进地址
- **WHEN** 用户打开旧项目每日演进链接
- **THEN** 页面 MUST 转到动态页中的同一项目与日期，且不再打开项目资料副屏

### Requirement: Buildr Web Task 详情必须提供 UI Prototype 视图
Buildr Web Task 详情 MUST 在方案设计节点提供实际已有“原型”的文档切换项，按需读取当前 Task 关联 Change 中可发现的一个或多个 UI Prototype 页面，并 MUST 允许用户在页面列表中选择和操作当前页面。页面 MUST 同时说明 UI Prototype 是实现参考而非正式设计、canonical spec 或像素级验收标准。当当前页面可在舞台中展示时，原型舞台 MUST 提供「新窗口打开」控件，并用新窗口打开该页面同一 Task-scoped 内容 URL。

#### Scenario: Task 存在多个原型页面
- **WHEN** 只读 API 返回两个或以上 UI Prototype 页面
- **THEN** 原型视图 MUST 展示全部页面的标题、关联 Change 与 portable 相对路径
- **AND** 用户选择任一页面后 MUST 在同一 Task 详情中看到对应完整可交互页面

#### Scenario: Task 没有可发现原型
- **WHEN** Task 没有关联 Change、Change 暂不可用或关联 Change 中没有带新标记的 HTML
- **THEN** 对应节点 MUST 展示必要的空态或诊断
- **AND** MUST NOT 改变 Task 状态或隐藏其他详情视图

#### Scenario: 用新窗口打开当前原型页面
- **WHEN** 原型舞台正在展示当前选中页面
- **THEN** 舞台 MUST 提供「新窗口打开」控件
- **AND** 激活后 MUST 用新窗口打开 iframe 正在使用的同一 Task-scoped 内容 URL
- **AND** MUST NOT 把原型 HTML 注入 Buildr Web 父页面 DOM

### Requirement: UI Prototype API 必须保持 Task-scoped 只读边界
本机 HTTP interface MUST 提供只读 Task-scoped UI Prototype API，从 Task Record 的 Change 引用和 saved Environment current 解析 working Change。`/ui-prototypes` 列表响应 MUST 返回全部带 `buildr:ui-prototype` 标记页面的不透明 ID、标题、lifecycle 与 portable 相对路径；具体 HTML MUST 只通过同一 Task 与已发现页面 ID 的专用响应读取。API MUST 忽略旧 `buildr:ui-preview` 标记、符号链接、未标记或超出安全读取边界的文件，MUST NOT 接受 filesystem path、写入 Task/Change 或提供任意文件 HTML 路由。

#### Scenario: 读取候选工作副本的多个页面
- **WHEN** active Task 的 saved Environment current 指向含多个原型页面的可用候选 Change
- **THEN** API MUST 优先返回候选 working copy 中的全部带新标记页面
- **AND** MUST NOT 用 retained baseline 覆盖候选内容

#### Scenario: Change 含有旧标记或其他 HTML
- **WHEN** Task 关联 Change 同时含有旧标记、未标记 HTML、符号链接或超限文件
- **THEN** API MUST 不返回这些文件内容
- **AND** 适用的跳过原因 MUST 以不泄露绝对路径的诊断表达

#### Scenario: 调用旧 Preview API
- **WHEN** 客户端请求旧 `/ui-previews` 列表或内容 route
- **THEN** 本机 HTTP interface MUST NOT 将其作为 UI Prototype API 处理
- **AND** MUST NOT 提供兼容重定向或别名

### Requirement: Buildr Web 必须隔离 UI Prototype 可执行内容
Buildr Web MUST 在不含 `allow-same-origin` 的 sandbox iframe 中运行每个 UI Prototype，仅允许页面自身 JavaScript 交互。页面内容响应 MUST 以 HTTP CSP 同时施加 `sandbox allow-scripts` 与离线资源策略，禁止网络连接、外部脚本/样式/字体、父页面访问与 Buildr session/API 权限；直接打开内容响应时 MUST 继续处于 opaque origin。客户端 MUST NOT 使用 `dangerouslySetInnerHTML` 或继承主页面脚本限制的 `srcdoc` 把原型内容注入 Buildr Web DOM。

#### Scenario: 原型包含交互脚本
- **WHEN** 任一 UI Prototype HTML 使用内联 JavaScript 切换关键状态
- **THEN** iframe MUST 允许该页面内部交互正常运行
- **AND** 脚本 MUST 处于 opaque origin，不能读取父页面 DOM 或 Buildr session

#### Scenario: 原型引用远程资源
- **WHEN** HTML 尝试加载远程脚本、样式、字体、图像或发起网络请求
- **THEN** prototype document CSP MUST 阻止该请求
- **AND** Buildr Web 主页面与其他原型页面 MUST 保持可用

#### Scenario: 新窗口直接打开当前原型页面
- **WHEN** 用户从原型舞台用新窗口打开当前页面的内容 URL
- **THEN** 新窗口 MUST 加载同一 Task-scoped 内容响应
- **AND** 该文档 MUST 继续处于 opaque origin，不能读取 Buildr session 或父页面 DOM

### Requirement: Buildr Web 必须统一具名 Workspace 相对 Markdown 引用
Task、Project与Service页面 MUST使用共享解析规则处理带用户可读名称的Workspace相对`.md`引用，根据已登记Project `source.path`与页面scope解析到具名项目；Task使用任务范围文档接口，Project和Service使用各自文档接口，并分别表达“引用可解析”与“正文当前可读取”。页面 MUST NOT按目录约定猜测Project、读取绝对路径、扫描Workspace或因正文当前不可读而改写引用。

#### Scenario: 在Task中打开具名文档引用
- **WHEN** Task Intent包含位于Task scope已登记Project内的具名Workspace相对Markdown链接
- **THEN** 页面 MUST显示链接名称并在解析成功后标记引用scope
- **AND** 只有对应文档接口成功返回后才 MUST显示正文当前可读取

#### Scenario: Project或Service文档继续相对导航
- **WHEN** 用户在Project或Service文档正文中点击同一Project内的相对Markdown链接
- **THEN** 共享解析规则 MUST解析为规范化Workspace引用并继续通过同一Project Document API打开
- **AND** 越界、非Markdown或其他Project引用 MUST被拒绝

#### Scenario: 引用可解析但正文不可读取
- **WHEN** 引用语法与scope合法但文档缺失、不可读或API返回失败
- **THEN** 页面 MUST保留“引用已解析”事实并显示“正文当前不可读取”的局部提示
- **AND** MUST NOT将其升级为Task lifecycle失败、自动修复或任意文件读取

### Requirement: Buildr Web 前端源资产必须使用统一公开术语
当前 Buildr Web 前端的页面标题、测试标题、组件说明和服务引用 MUST 使用 Buildr Web 及其分层术语；兼容协议标识 MUST 仅作为内部 identity 出现。

#### Scenario: 前端源资产扫描
- **WHEN** 维护者扫描当前 `buildr-web` 源码、测试和构建配置
- **THEN** 用户可见旧称 MUST 不再作为 canonical 命名出现
- **AND** `local-app-*` 仅能出现在明确标注的兼容 identity 或测试 fixture 中

### Requirement: Buildr Web必须在概览按需查看本机复盘文档
Buildr Web MUST在Task概览显示复盘文档固定本机路径与`无复盘文档|等待你的决定|已经决定`状态。只有Task Record已经登记文档时才提供查看入口；打开正文 MUST调用Task Record只读接口并 MUST不产生写入。

#### Scenario: 只读查看当前复盘
- **WHEN** 用户打开已登记复盘文档
- **THEN** 页面 MUST展示Markdown、实际摘要状态和局部漂移提示
- **AND** Task Record digest MUST保持不变

#### Scenario: 用户明确完成决定
- **WHEN** 用户查看匹配当前登记摘要的文档并点击“我已完成决定”
- **THEN** 页面 MUST通过Task Record update提交当前record digest、文档摘要和`decided`
- **AND** MUST不创建后续Task或处置说明

### Requirement: Task详情必须直接展示Task Record与独立专业事实
Buildr Web MUST在任务详情直接展示Task Record目标、状态及默认任务需求正文；结果在收尾节点展示，Change、父子关系和复盘在对应阅读入口展示。Review与Verification MUST独立读取并在所选节点直接呈现完整结果，父任务协调只在适用Task显示。页面 MUST不请求Task Overview、组合统一推进状态或根据专业结果推断Task能否完成。

#### Scenario: 普通Task没有专业结果
- **WHEN** Task只有Task Record且没有Review或Verification
- **THEN** 任务详情 MUST正常显示目标，已有结果仍可在收尾节点读取
- **AND** 专业结果缺失 MUST不形成Task错误或全局阻塞

#### Scenario: 专业读取失败
- **WHEN** Review、Verification或父任务协调中的一个读取失败
- **THEN** 页面 MUST只在对应区域显示局部错误
- **AND** Task Record及其他已读取事实 MUST继续可见

### Requirement: Buildr Web必须直接消费Parent Coordination v4
Buildr Web MUST通过生成DTO消费Parent Coordination v4，只展示所属父任务、直接Children、各自状态与结果、旧计划历史、完成观察和已保存授权依据。页面 MUST不重建Contribution、Handoff、依赖、完成比例或推荐下一步。

#### Scenario: Parent详情加载
- **WHEN** endpoint返回`mode: parent`
- **THEN** 页面 MUST展示整体目标、直接Children及父任务完成授权边界
- **AND** MUST不传播或修改任一Child状态

#### Scenario: Child或普通Task详情加载
- **WHEN** endpoint返回`child|ordinary`
- **THEN** 页面 MUST只展示适用的Parent链接或不显示父任务区域
- **AND** MUST不创建父计划空态或进度聚合

### Requirement: Buildr Web Task Record 必须以内聚 feature 组织
Buildr Web MUST将Task功能组织为`src/features/task/{pages,hooks,components,api}`四个平级目录。`pages` MUST只读取路由、调用Hook并组装组件；`hooks` MUST管理服务器数据、mutation、请求取消、竞态与局部失败；`components` MUST只通过props或页面内专用Hook消费业务数据和回调且不得直接调用后端Client；`api` MUST只封装Task endpoint和generated Task Record DTO且不得依赖React。通用fetch/session/Workspace scope transport MUST保留在`src/api`且不得反向依赖Task feature；Review、Verification、Parent Coordination、Change、UI Prototype与Project Document MUST继续使用各自Client和独立事实边界。

#### Scenario: 构建 Task Record 页面
- **WHEN** `TasksPage`、`TaskDetailPage`或`TasksSection`加载Task功能
- **THEN** 页面 MUST通过`useTaskList`、`useTaskDetail`、`useTaskActions`、`useTaskArtifacts`、`useTaskEvidence`或`useTaskRequestLifecycle`消费状态与动作
- **AND** 页面 MUST不直接调用`api`、`taskApi`或其他后端Client
- **AND** MUST保持稳定DOM selector、现有路由与用户交互

#### Scenario: 组件展示和提交用户输入
- **WHEN** Task filter、table、overview、relations、modal、retrospective、document preview、prototype或evidence组件工作
- **THEN** 组件 MUST只消费props和回调，或调用只服务该组件的页面内Hook，并可以维护纯界面局部状态
- **AND** 组件 MUST不直接调用任何后端Client或取得服务器数据authority

#### Scenario: 专业结果读取失败
- **WHEN** Review、Verification、Parent Coordination、Change 或 UI Prototype 的读取失败
- **THEN** Task Record 与其他已成功读取的事实 MUST继续可见
- **AND** 失败 MUST由Hook保持在所属页面区域，不得升级为整个Task页面不可用

#### Scenario: 共享 HTTP transport
- **WHEN** Task Hook发起list、detail、update、complete、abandon或retrospectiveDocument请求
- **THEN** feature内`task-api.ts` MUST复用`src/api`提供的session、Workspace scope与底层HTTP transport
- **AND** `src/api/index.ts` MUST不导入Task feature
- **AND** `api`目录 MUST不依赖React、Hook、Page或Component
- **AND** generated DTO MUST保留公开Task Record协议身份并生成到`features/task/api/generated/`

#### Scenario: Feature 目录保持最小层级
- **WHEN** 维护者检查Task前端目录
- **THEN** `logic`、`list`、`detail`、`actions`、`model`与通用`utils`子目录 MUST不存在
- **AND** 纯函数 MUST先位于真实使用的Hook或组件，只有出现多处实际复用后才建立具名文件

### Requirement: 技能入口只读展示已登记技能
Buildr Web MUST 在工作空间左侧提供“技能”入口，只读取现有工作资产清单中的技能集合，展示名称和用途，保留读取失败与空集合状态；MUST NOT 将其他资产类型混入技能列表，也 MUST NOT 执行安装、卸载或运行时同步。

#### Scenario: 浏览技能
- **WHEN** 用户打开 `/workspaces/:workspaceId/skills`
- **THEN** MUST 只读呈现当前 Workspace 技能；空集合和读取失败 MUST 明确表达
- **AND** MUST 不影响任务、项目或服务页面导航

### Requirement: 任务详情必须按工作路径直接组织已有内容
默认页面 MUST在列表旁的现有副屏紧凑展示标题、编码、目标和状态，再以紧凑标签连接任务需求、方案设计、开发实现和任务收尾；方案审查 MUST在方案设计内，实现审查和开发验证 MUST在开发实现内，用户确认 MUST在任务收尾内。默认 MUST选中任务需求并直接显示正文，切换节点 MUST直接显示对应文档或完整结果，多份材料 MUST在同层切换，不经过文件入口或资料目录中转。

#### Scenario: 读取完整任务
- **WHEN** Task拥有 brief.md、proposal.md、design.md、tasks.md、规范文件及专业结果
- **THEN** 需求节点 MUST直接预览 brief，设计节点 MUST默认显示 proposal 正文并可切换 design/specs，实施清单 MUST在全局侧栏直接显示，实施节点 MUST显示实现审查与开发验证摘要，设计与实现内部的审查 MUST默认显示最新结论并可切换历次记录，开发实现内的验证 MUST直接展示当前结果及检查依据，收尾 MUST集中使用用户确认及交付记录
- **AND** 多个关联变更 MUST标识材料来源，原始正文保持其自身权威

#### Scenario: 简单任务与空内容
- **WHEN** Task没有方案材料或部分节点没有记录
- **THEN** 页面 MUST保持四个主节点并如实显示空内容；MUST NOT强制创建文档、报告、子任务或错误状态
- **AND** brief缺失 MUST显示暂无补充需求或说明，任务目标仍可读

#### Scenario: 当前工作与阅读选择不同
- **WHEN** 智能体记录 implementation 表示验证失败后的修复，而用户在方案设计内选择方案审查
- **THEN** 页面 MUST同时保留实现处的当前标记与方案设计及其内部方案审查的阅读选中态，显示保存的失败结果与当前实现标记
- **AND** 没有明确 stage 时 MUST不标记当前节点；MUST NOT从文件存在、清单数量或 active 状态推断当前节点、自动执行或通过

### Requirement: 任务详情阅读与数据维护必须遵循统一交互
任务列表点击任务 MUST通过现有系统分屏在副屏展示任务详情，主屏列表、筛选与滚动 MUST保持。节点文档、用户答复与收尾 MUST在该详情内直接显示；引用文档 MUST复用现有抽屉阅读；审查与验证 MUST在节点目录右侧阅读，实施清单 MUST在全局侧栏直接显示，不创建第三分屏或嵌套分屏。维护任务、进展和答复 MUST使用统一抽屉。关闭任务副屏 MUST恢复原列表，深链 MUST仍可定位该任务；页面 MUST复用现有主题、控件与窄屏阅读规则。

#### Scenario: 阅读过程中维护
- **WHEN** 用户在任务副屏直接阅读方案后，在抽屉修改任务或记录答复并保存或取消
- **THEN** 抽屉 MUST关闭并保留阅读上下文，保存后刷新相关事实；取消不得改变原内容

#### Scenario: 并发冲突
- **WHEN** 用户基于旧摘要或事项身份保存
- **THEN** 抽屉 MUST保留输入并提供重读与核对；MUST NOT静默覆盖、关闭或自动重放

#### Scenario: 深入专业结论
- **WHEN** 用户在设计/实现内选择审查或在开发实现内选择验证
- **THEN** 节点目录右侧 MUST直接展示时间、结论、问题及未覆盖范围，并保持各自专业来源
- **AND** MUST NOT把历史通过、缺少记录或用户答复解释为当前验收、通用授权或任务完成

### Requirement: 任务材料必须读取任务的实际文件现场
任务详情 MUST按任务关联、项目范围与受管工作树（Worktree）证据选择实际文件根；存在可用工作树时 MUST读取其中未提交的需求、方案、规范、清单、原型及任务引用的项目文档。副屏 MUST标识来源，不能混用保留副本正文。

#### Scenario: 工作树与主目录不同
- **WHEN** 同一相对文档在工作树中已修改而主目录仍是旧内容
- **THEN** 页面 MUST展示工作树正文；后续相对文档链接 MUST保持该任务现场

#### Scenario: 工作树缺失或身份漂移
- **WHEN** 已关联的工作树无法证明身份，或选定工作树中的文件缺失
- **THEN** 对应入口 MUST显示明确诊断或缺失，MUST NOT静默使用主目录同名文件冒充当前内容
- **AND** 已安全清理工作树、当前无工作树关联时 MUST可读取保留目录或归档内容并标明来源

#### Scenario: 限定文档范围
- **WHEN** 请求文档不属于任务项目范围、路径越界、为符号链接或非 Markdown
- **THEN** 任务文档入口 MUST拒绝读取，不能成为任意文件读取接口

#### Scenario: 从列表查看并切换任务
- **WHEN** 用户在筛选后的任务列表点击任务，再切换另一个任务
- **THEN** 系统 MUST复用已有副屏，主屏列表保持可操作且不重置筛选、已加载批次或滚动；MUST NOT创建嵌套分屏
- **AND** 每个新打开的任务 MUST默认显示任务需求正文，后台当前节点变化不得强制改变阅读选择

### Requirement: 节点阅读必须连续且内容按判断需要取舍
页面 MUST记住每个节点选中的文档、审查记录与阅读位置，关联阅读返回 MUST恢复原上下文；打开新任务 MUST默认需求。页面 MUST优先呈现实际阶段、结论、问题及未覆盖范围，MUST NOT堆叠重复标题、无内容栏目或内部结果摘要值。历史通过 MUST明确表达为最近保存的结论，不能推导当前版本通过。

#### Scenario: 对照方案与实现
- **WHEN** 用户选择设计文档，切到开发实现，再返回方案设计
- **THEN** 页面 MUST保持所选设计文档和阅读位置，不退回默认提案

#### Scenario: 多份需求名称相同
- **WHEN** 任务关联多个变更且均有 brief
- **THEN** 需求内容选项 MUST用关联变更名称区分；单文件 MUST直接显示正文

#### Scenario: 收尾中确认成果
- **WHEN** 任务具有待验收事项或已记录用户意见
- **THEN** 任务收尾 MUST显示该事项及现有答复动作，保存意见 MUST不自动完成任务

### Requirement: 任务总览与列表必须优先呈现判断所需事实
任务详情 MUST直接显示任务目标、状态、当前节点标记和待人处理事项，范围与实际更新时点 MUST可直接获知，不通过通用任务信息目录中转。任务列表 MUST有表头并采用紧凑分列，标题与进展最多占两行，项目、状态、更新时点按空间显示；编号 MUST不占额外列表行。

#### Scenario: 从紧凑列表进入任务
- **WHEN** 用户在列表打开任务副屏
- **THEN** 列表 MUST保持筛选与位置，详情总览 MUST可直接解释当前工作；窄布局 MUST保持任务和状态可读且不产生页面横向溢出

#### Scenario: 必要操作与原文引用
- **WHEN** 用户阅读任务与已有材料
- **THEN** 界面 MUST保留原文中的有效文档引用，MUST NOT为同一材料重复显示技术目录入口；接续指令 MUST明确是生成指令，完成登记 MUST在任务级更多菜单，普通阅读 MUST不要求人工更新进展

#### Scenario: 避免多层导航和结论重复
- **WHEN** 用户查看方案设计或开发实现
- **THEN** 页面 MUST用单一节点导航与节点左侧内容目录组织正文，审查和验证在所属节点目录列出并可直接读取报告
- **AND** 页面 MUST NOT在总览、节点选项和报告中重复堆叠同一检查状态；宽副屏总览可在正文侧边展示，窄副屏 MUST回流且不挤压正文

#### Scenario: 恢复窗口焦点
- **WHEN** 用户切离浏览器后再次返回
- **THEN** 任务详情 MUST NOT因窗口 focus 或 visibilitychange 自动重新读取
- **AND** 用户明确刷新和维护后的必要更新 MUST继续有效

#### Scenario: 全局清单与来源
- **WHEN** 任务材料可读取
- **THEN** 简介下方属性行 MUST呈现项目、各关联变更的实际材料来源与最后更新时间，全局侧栏 MUST直接呈现实施清单，节点正文 MUST NOT重复来源脚注
- **AND** 阅读抽屉关闭后 MUST保留节点文档及阅读位置

#### Scenario: 统一文件与记录阅读
- **WHEN** 用户选择节点文档、历次审查或验证记录
- **THEN** 页面 MUST在节点左侧目录标记当前选择，并在右侧展示内容；多次审查 MUST直接列出次数、日期和结论而非藏于菜单
- **AND** Markdown 文档 MUST复用共享阅读组件，可在渲染正文与实际原文之间切换

#### Scenario: 随时登记完成
- **WHEN** 任务处于可维护状态且用户打开任务级操作菜单
- **THEN** 页面 MUST提供登记完成，与编辑和放弃处于同级，且 MUST保留原有并发与适用授权校验

#### Scenario: 精简重复信息与目录层级
- **WHEN** 用户读取任务详情
- **THEN** 编码 MUST位于标题下方；顶部 MUST NOT重复展示常规阶段进展和下一步，必要待人处理事项 MUST保持可见
- **AND** 规范项 MUST以规范分组与文件子项展示，审查记录 MUST作为具名审查分组的子项展示；报告 MUST NOT追加单独审查对象或内部版本区块，原专业事实 MUST保持不变

#### Scenario: 统一目录与专业结果呈现
- **WHEN** 用户浏览规范、审查记录或验证结果
- **THEN** 规范与审查 MUST采用同级分组和统一子项缩进，审查正文 MUST标明所选次数
- **AND** 验证单项状态仅在与总结果一致且只有一项时可不重复展示，其他情况 MUST逐项就近展示；所有检查摘要、未覆盖项和适用性 MUST保留
