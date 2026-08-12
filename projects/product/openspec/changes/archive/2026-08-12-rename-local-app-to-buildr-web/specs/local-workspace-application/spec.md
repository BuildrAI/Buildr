## ADDED Requirements

### Requirement: 当前本机浏览器产品必须采用 Buildr Web 分层术语
当前用户能力 MUST 命名为 Buildr Web（本机 Web 界面）；`buildr-web` Service MUST 命名为 Buildr Web Frontend Service；`buildr` Service 中负责 loopback HTTP、session、安全与 Application 调用的部分 MUST 命名为 Buildr Web Runtime；平台图形入口 MUST 命名为 Buildr Web Launcher。Buildr App MUST 保留给未来真正的桌面应用，当前产品、帮助、页面与 Launcher MUST NOT 使用该名称。

#### Scenario: 用户打开当前本机界面
- **WHEN** 用户通过 CLI、npm、checkout 或平台图形入口打开浏览器中的本机界面
- **THEN** 可见产品名称 MUST 为 Buildr Web
- **AND** 页面、帮助、错误、日志说明与安装提示 MUST NOT 将其称为 Local App 或 Buildr App

#### Scenario: 维护者定位组件责任
- **WHEN** 维护者阅读 architecture、Service knowledge 或实现说明
- **THEN** 文档 MUST 区分 Buildr Web、Buildr Web Frontend Service、Buildr Web Runtime 与 Buildr Web Launcher
- **AND** MUST NOT 将 Frontend Service、Runtime 或 Launcher 描述为第二个产品或第二套 authority

#### Scenario: Buildr App 保留给未来桌面产品
- **WHEN** 当前 Buildr Web 产品表面需要命名图形入口或本机 Runtime
- **THEN** MUST 使用 Buildr Web Launcher 或 Buildr Web Runtime
- **AND** MUST NOT 以 Buildr App 名义注册当前命令、bundle display name、shortcut 或帮助主题

### Requirement: Buildr Web Runtime 必须保持现有本机安全与 authority 不变量
Buildr Web Runtime MUST 只绑定 loopback、按需启动并复用现有随机端口、session token、Origin 校验、单实例、Workspace Registry 与 Application 接口。未运行 `buildr web` 或明确 preview/Launcher 路径时 HTTP 服务 MUST NOT 启动。Buildr Web MUST NOT 创建新数据库、第二 writer、Web 专用业务状态或远程服务。

#### Scenario: no-open 启动隔离服务
- **WHEN** 调用方运行 `buildr web --no-open`
- **THEN** Runtime MUST 在 loopback 上启动或复用 matching 单实例并通过 authenticated health/readiness 检查
- **AND** MUST NOT 打开浏览器、绑定非 loopback 地址或绕过 session/Origin 安全边界

#### Scenario: Workspace 事实写入
- **WHEN** Buildr Web 执行允许的 metadata 或 Task action
- **THEN** HTTP interface MUST 调用现有 Application，由 Workspace Registry、SQLite 或对应 canonical authority 执行写入
- **AND** Web/React 层 MUST NOT 直连 SQLite、复制 validator 或建立第二份业务状态

### Requirement: Buildr Web Launcher 必须受控迁移 Buildr-owned 旧入口
release Launcher MUST 显示为 `Buildr Web`，development Launcher MUST 显示为 `Buildr Web Dev`，且 macOS/Windows 生成内容 MUST 执行 `buildr web`。安装或卸载 MAY 处理旧 `Buildr.app`、`Buildr Dev.app` 与旧 Windows shortcut，但 MUST 只迁移或删除能由 `buildr.launcher-identity/v1`、matching channel 和已知 Buildr install target 证明 ownership 的入口。Bundle protocol/persistent identity MAY 保留内部 `local-app` 名称以维持 ownership，不得因此向用户展示旧产品名。

#### Scenario: 成功安装新 Launcher 后清理 owned 旧入口
- **WHEN** 新 `Buildr Web` 或 `Buildr Web Dev` Launcher 已完成 staging、identity 验证和安全切换，且旧入口具有 matching Buildr ownership evidence
- **THEN** installer MUST 删除对应 channel 的旧入口和旧 shortcut
- **AND** 最终 MUST 不留下两个可误启动的正式或开发图形入口

#### Scenario: 旧入口 ownership 不可证明
- **WHEN** 旧名称路径、bundle 或 shortcut 缺少 matching launcher identity、目标越出已知 install root、channel 不符或已被用户/第三方修改
- **THEN** installer/uninstaller MUST 保留该入口并返回可解释 diagnostic
- **AND** MUST NOT 覆盖、重命名或删除未知文件

#### Scenario: Launcher 卸载保留用户数据
- **WHEN** 用户卸载 release 或 development Buildr Web Launcher
- **THEN** uninstaller MUST 只移除当前 channel 拥有的新旧 Launcher、previous/staging 与 owned shortcut
- **AND** MUST 保留 Workspace Registry、日志、npm CLI、其他 channel 与全部 Workspace 数据

### Requirement: Buildr Web 必须以单实例本机 Web 服务运行
Buildr MUST 启动或复用一个只监听 loopback 的全局本机 Web 服务，并 MUST 在服务就绪后打开默认浏览器。

#### Scenario: 首次启动 App
- **WHEN** 当前用户没有健康的 Buildr Web 实例
- **THEN** `buildr web` MUST 启动一个全局实例、记录可验证的 runtime state 并打开默认浏览器

#### Scenario: 重复启动 App
- **WHEN** 当前用户已经存在通过 Buildr health handshake 的实例
- **THEN** 启动入口 MUST 复用已有实例并重新打开浏览器
- **AND** MUST NOT 再启动一个 server

#### Scenario: 恢复陈旧实例状态
- **WHEN** runtime state 指向不存在或无法通过带实例 secret 的 health handshake 的进程
- **THEN** Buildr MUST 安全替换陈旧状态并启动新实例
- **AND** MUST 保留持久 Workspace 登记列表

#### Scenario: 开发环境不打开浏览器
- **WHEN** 调用方使用 `buildr web --no-open`
- **THEN** Buildr MUST 启动或复用实例但 MUST NOT 打开浏览器

#### Scenario: 兼容指定 Workspace 启动
- **WHEN** 调用方使用 `buildr web --target <workspace>`
- **THEN** Buildr MUST 验证并登记该 Workspace、启动或复用全局实例，并打开其 Workspace route

### Requirement: 平台安装必须提供完整且可解释的 Buildr Web
Buildr MUST 为 macOS 和 Windows 提供不依赖用户预装 Node、npm 或 PATH 的平台安装产物，并 MUST 将安装、启动和后台常驻保持为不同动作。

#### Scenario: macOS 安装 Buildr Web Launcher
- **WHEN** 普通用户完成 macOS 平台安装
- **THEN** 系统 MUST 提供带正确名称、图标、版本和独立 runtime 的 `Buildr Web.app` 启动入口
- **AND** 安装 MUST NOT 无提示启动 Buildr 或注册登录启动

#### Scenario: Windows 安装 Buildr Web Launcher
- **WHEN** 普通用户完成 Windows 平台安装
- **THEN** 系统 MUST 提供带正确名称、图标、版本和独立 runtime 的开始菜单入口
- **AND** 桌面快捷方式 MUST 由安装选择明确决定
- **AND** 安装 MUST NOT 要求用户配置命令行环境

#### Scenario: 安装完成后显式打开
- **WHEN** 安装完成界面提供“打开 Buildr”且用户明确选择该动作
- **THEN** installer MUST 通过已安装 launcher 启动 Buildr
- **AND** 后续行为 MUST 与用户日常点击同一 launcher 一致

### Requirement: Buildr Web 首次启动必须引导建立 Workspace 上下文
Buildr MUST 在用户级 Workspace Registry 为空时提供可理解的首次运行页面，解释 Workspace → Project → Service 最小模型，并 MUST 复用全局 Web 应用而不是在 installer 中维护第二套 Workspace 流程。

#### Scenario: 首次打开空 Registry
- **WHEN** 用户第一次打开 Buildr Web 且 Workspace Registry 为空
- **THEN** 页面 MUST 说明 Workspace、Project 与 Service 分别代表什么以及三者关系
- **AND** MUST 将“添加已有工作空间”作为主操作，将“让 Agent 创建工作空间”作为次操作
- **AND** MUST NOT 首先展示 Change、Rules、Skills、runtime 或 CLI 教学

#### Scenario: 选择已有 Workspace
- **WHEN** 首次运行用户选择一个包含合法 Buildr Workspace identity 的目录
- **THEN** Buildr MUST 登记该 Workspace 并进入其“开始”页
- **AND** MUST NOT 复制、迁移或修改 Workspace 源资产

#### Scenario: 选择未初始化目录
- **WHEN** 用户通过 native directory picker 选择可读取但尚未初始化的目录
- **THEN** Buildr MUST 保持 Registry 不变并显示该目录尚不是 Buildr Workspace
- **AND** 页面 MUST 提供重新选择和生成带该 candidate 位置的 Workspace 初始化 Agent Action
- **AND** 页面 MUST NOT 自动执行 init

#### Scenario: 选择需要迁移或修复的目录
- **WHEN** picker 选择的目录存在 migration required、invalid metadata 或可恢复诊断
- **THEN** Buildr MUST 保持 Registry 不变并展示稳定、可理解的诊断类别
- **AND** 页面 MUST 提供重新选择和生成 canonical sync/repair Agent Action
- **AND** MUST NOT 自动选择 identity、覆盖文件或执行迁移

#### Scenario: 选择不可读或 identity 冲突目录
- **WHEN** picker 选择的目录不可读或与已登记 Workspace identity 冲突
- **THEN** Buildr MUST 保持 Registry 不变并说明不能登记的原因
- **AND** MUST NOT 生成声称可以安全自动修复的结果

#### Scenario: 暂不登记 Workspace
- **WHEN** 用户选择稍后处理
- **THEN** Buildr MUST 保持全局应用可退出
- **AND** MUST NOT 创建虚构 Workspace 或自动扫描磁盘

### Requirement: Buildr Web 必须生成受限 Task Verification Agent prompt
本机应用 MAY 在 Task“证据”视图的验证结果区块提供 Agent Action 以生成 Task Verification prompt。prompt MUST 绑定正式 Task ID、Task Intent 和可选调用方已知 target identity，指导 Agent 读取 v3 Skill、inspect current Result、恢复 ready Environment、执行适用声明能力，并只在完整结论后通过 Application record；复制 prompt 本身 MUST NOT 等于 recorded。

#### Scenario: 用户请求开始验证
- **WHEN** 用户从 Task“证据”视图的验证结果区块触发 Agent Action
- **THEN** prompt MUST明确execution evidence与Workspace-local current Result分离、中断不覆盖和coverage gap边界
- **AND** Buildr Web MUST 不执行测试、不生成 target identity、不写 Result

#### Scenario: terminal Task 请求新验证
- **WHEN** Task Record 已是 completed 或 abandoned
- **THEN** prompt Application MUST fail closed
- **AND** 已有 Result 仍可只读查看

### Requirement: Buildr Web Task 视图必须只消费 Workspace structured Task read model
Buildr Web MUST 继续通过 Task Record Application 列出、查看和维护 Workspace Task，并 MUST 将 SQLite repository 保持为 interface 后的本地 infrastructure。页面和 HTTP interface MUST NOT 读取旧 `task.yml`、打开数据库、执行 SQL、解释 migration ledger 或暴露 database path/table/row id。Buildr Web MUST 先通过已登记 Workspace identity 将请求解析为 root，再由 Task Application 消费该 root 的 structured Task read model；对已经解析 root 的只读调用 MUST NOT 执行 Git/worktree provenance 校验或 `git rev-parse`。Buildr Web 的 Task mutation MUST NOT 添加、移除或以其他方式维护 Change 引用。

#### Scenario: 浏览 SQLite-backed Task 列表
- **WHEN** 用户进入已登记 Workspace 的 Task 列表
- **THEN** API MUST 通过 Task Application 返回该 Workspace root 的 SQLite authority 中真实 Task 的排序 read model
- **AND** 页面 MUST NOT 扫描 `.buildr/tasks/`、合并旧 YAML 或按 Task 专业目录推断缺失记录

#### Scenario: canonical root 读取不依赖 Git
- **WHEN** 已登记 Workspace registry 将 `workspaceId` 解析为 canonical root，且用户读取 Task 列表或详情
- **THEN** API MUST 通过 Application 和 Structured Store 返回 read model
- **AND** 该只读路径 MUST NOT 调用 Git/worktree observer、`git rev-parse` 或重新判断 root provenance

#### Scenario: candidate 或 validation root 读取自身 store
- **WHEN** candidate 或 validation Workspace 已有自身 local structured store，且 Application 读取该 Workspace 的 Task
- **THEN** API MUST 只读取该 root 的 store
- **AND** MUST NOT 打开 retained canonical store 或修改任一 store

#### Scenario: 数据库尚未初始化
- **WHEN** 已登记 Workspace 尚无 structured store 且用户打开 Task 列表
- **THEN** API MUST 返回成功的空 Task 集合
- **AND** GET 请求 MUST NOT 创建数据库、目录或 migration ledger

#### Scenario: 数据库不可用
- **WHEN** Task Application 返回 schema drift、version newer、busy、corruption 或 integrity diagnostic
- **THEN** Buildr Web MUST 显示稳定、可操作的 Workspace Task unavailable 状态
- **AND** MUST NOT 静默显示空列表、自动重建数据库、回退旧 YAML 或把 SQL/本机 path 暴露给浏览器

#### Scenario: Buildr Web 修改 Task
- **WHEN** 用户通过受保护的 Task API 创建、更新、完成或放弃 Task
- **THEN** HTTP interface MUST 只提交明确 action input 和适用的 `expectedRecordDigest` 给 Task Application
- **AND** Buildr Web update input MUST NOT 接受 `addChanges` 或 `removeChanges`
- **AND** HTTP interface MUST NOT 接受 SQL、database path、table、row id、migration version 或完整 next-state document

### Requirement: Buildr Web 必须动态投影和维护 Parent Task 层级
Buildr Web Task 列表与详情 MUST 通过 Task Record Application read model 展示直接 Parent/Children；active Task 的创建与编辑 MUST 允许选择或清除合法 Parent，并 MUST 复用 expected `recordDigest` 冲突边界。

#### Scenario: 查看协调 Task
- **WHEN** 用户打开拥有直接 Children 的 Task 详情
- **THEN** 页面 MUST 展示可导航的直接 Child 列表及每个 Child 的真实 status
- **AND** MUST NOT 把 Child completed 自动显示为 Parent completed 或整体目标已满足

#### Scenario: 查看 Child Task
- **WHEN** 用户打开带 Parent 的 Child Task
- **THEN** 页面 MUST 展示可导航的 Parent identity、title 与真实 status
- **AND** MUST NOT 复制 Parent 的专业 Result 到 Child

#### Scenario: 编辑 Parent 发生冲突
- **WHEN** 页面读取后 Parent/Child 关系已被其他产品动作改变
- **THEN** mutation MUST 因 expected `recordDigest` 陈旧而 fail closed
- **AND** 页面 MUST 要求刷新而不是自动合并

#### Scenario: terminal Task 层级只读
- **WHEN** Task 已 completed 或 abandoned
- **THEN** 页面 MUST 保留 Parent/Children 投影并禁用关系 mutation
- **AND** MUST NOT 提供自动处置关联 Task 的按钮

### Requirement: Buildr Web 必须以 Application terminal projection 展示 Task 交付事实
Buildr Web Task详情 MUST保持“概览、研发、证据、复盘、环境”五个一级页签，并 MUST只通过Application read model获取current/terminal facts。“概览”MUST调用Task Overview Application的一次SQLite联表读取；其他页签MUST继续调用所属专业Application reader。HTTP/Web MUST NOT直接读取SQLite、扫描Finish JSON、计算live identity、接受target/root/path filesystem query或依赖独立lifecycle projection；Terminal Delivery Application MUST只查询Task、Development与唯一Finish current保存事实。

#### Scenario: completed delivered Task
- **WHEN** terminal projection返回delivered
- **THEN** 研发页主结论 MUST显示“已交付”，并展示交付时Task context、planning disposition、Content Target、verification policy、Candidate/generation与Development handoff
- **AND** MUST展示final commit/ref、完成时间与Environment cleanup为正常结果
- **AND** GET MUST NOT扫描Finish Result、恢复Environment或观察Git

#### Scenario: completed noChange Task
- **WHEN** Task completed且result.noChange为true
- **THEN** 页面 MUST显示“已完成，无需交付变更”
- **AND** MUST NOT要求或伪造Finish Result

#### Scenario: completed Task 缺少匹配 Finish
- **WHEN** Task completed、非noChange且Finish terminal current没有matching association
- **THEN** 页面 MUST显示“已完成，但交付未经证明”
- **AND** MUST NOT使用delivered的绿色成功语义或从其他来源补造

#### Scenario: terminal 证据视图
- **WHEN** terminal projection从Finish terminal current返回Review/Verification delivery association
- **THEN** 证据页 MUST使用“已随交付候选采用”与“已随交付目标验证通过/未通过”等交付时文案
- **AND** MUST将active保存值匹配关系与terminal association分开表达，不得在读取时重算live applicability

#### Scenario: 技术详情与单卡宽度
- **WHEN** 页面展示SHA、digest、`workspace-sqlite:` locator或单一Verification Result
- **THEN** 技术标识 MUST位于次要或可展开详情，Verification单卡 MUST使用合理最大宽度
- **AND** Agent生成的原始evidence内容 MUST保持原文，不由Web翻译或改写

Task Finish MAY请求Development Application针对一个允许的carrier root重观测complete Content Target，但MUST NOT创建Candidate。只有carrier Content Target与handoff Candidate绑定的target逐component相等且Task context/policy仍current时，Application MUST返回equivalent；否则MUST返回Development handoff失效。上述Finish动作完成后 MUST写入Finish terminal association；读取terminal Task时不得重新执行该重观测。

#### Scenario: 只增加delivery commit
- **WHEN** Finish机械提交当前内容但所有scope bytes与逻辑语义未变化
- **THEN** carrier equivalence MUST通过且Candidate identity保持不变
- **AND** commit、branch与ref MUST不进入Content Target或Candidate identity

#### Scenario: carrier prepare改变内容
- **WHEN** rebase、sync、archive、生成或冲突处理改变任一component identity
- **THEN** equivalence MUST失败并判定current handoff失效
- **AND** Finish MUST退出到Development重新验证和生成Candidate

### Requirement: Buildr Web 必须提供独立文章入口

Buildr Web MUST 在 Workspace 级应用外壳中提供独立的“文章”导航入口，并 MUST 提供文章列表页与文章详情页；文章页面 MUST 保持只读，不得提供文章编辑、发布或平台同步操作。

#### Scenario: 从工作空间导航打开文章

- **WHEN** 用户在已选定 Workspace 的 Buildr Web 中点击“文章”
- **THEN** 应用 MUST 导航到该 Workspace scoped 的文章列表页
- **AND** 导航项 MUST 在文章列表或详情页保持 active 状态

#### Scenario: 打开文章详情

- **WHEN** 用户从文章列表选择一篇有效文章
- **THEN** 应用 MUST 展示文章标题、发布状态、发布目标和渲染后的 Markdown 正文
- **AND** 页面 MUST 提供返回文章列表的可用链接
- **AND** 页面 MUST NOT 提供修改文章正文或发布状态的写操作

### Requirement: Buildr Web 必须从 canonical publication source 只读投影文章

Buildr Web MUST 通过 Application read model 读取已登记 Workspace 中 Product Project 的 `docs/publications/` Markdown 文件；HTTP/Web MUST NOT 直接扫描任意 root/path、读取 SQLite 中的文章副本或创建第二份文章正文。

#### Scenario: 读取文章列表

- **WHEN** Buildr Web 请求当前 Workspace 的文章列表
- **THEN** Application MUST 根据 registered Workspace 和 Product Project source 解析固定 publication root
- **AND** MUST 返回有效文章的稳定 ID、标题、类型、状态、发布日期和发布目标
- **AND** MUST 排除 `README.md`、隐藏文件和缺少有效文章 ID/标题的 Markdown 文件

#### Scenario: publication 目录不存在或为空

- **WHEN** Product Project 没有 `docs/publications/` 目录或目录中没有有效文章
- **THEN** API MUST 返回成功的空列表或明确的 `empty` read-model 状态
- **AND** Buildr Web MUST 展示“暂无文章”空状态
- **AND** MUST NOT 阻塞工作空间、项目、服务、任务或变更页面

#### Scenario: 文章详情不存在

- **WHEN** 用户请求不存在或已移除的 publication ID
- **THEN** API MUST 返回稳定的 not-found 诊断
- **AND** Buildr Web MUST 展示文章不可用状态及返回文章列表的链接

### Requirement: Buildr Web Markdown 视图必须支持受控本地图片

Buildr Web Markdown renderer MUST 支持标准 Markdown 图片语法，并 MUST 只将已由文章资源 API 解析的相对图片路径转换为本机同源资源 URL；不受控的图片路径 MUST NOT 绕过既有内容安全策略。

#### Scenario: 渲染文章本地图片

- **WHEN** 文章正文包含 `![alt](assets/<filename>)` 且资源 API 能解析该文件
- **THEN** 文章详情 MUST 渲染同源图片并保留 alt 文本
- **AND** 图片 MUST 使用当前 Buildr Web 的资源 URL

#### Scenario: 不受控图片路径

- **WHEN** Markdown 图片路径为绝对路径、包含 `..`、反斜杠或未通过文章资源映射
- **THEN** renderer MUST NOT 加载该图片
- **AND** 页面 MUST 保留安全的文本或空内容表现

### Requirement: Buildr Web 必须将 Change 限定为 Task-scoped 只读内容
Buildr Web MUST 只通过当前 Task 的已保存 Change 引用读取 Change 内容。HTTP/Web MUST NOT 提供 Buildr Web 的 Change 创建、修改、关联、移除、继续、审查、同步或归档操作；这些 Change 动作 MUST 保持为 Agent 在 Task 过程中使用相应 authority 推进的工作。

#### Scenario: 查看关联 Change 的完整 artifacts
- **WHEN** 用户从 Task 概览打开关联 Change
- **THEN** 页面 MUST 只通过 `/tasks/<task-id>/changes/<project>/<change>` 的 Task-scoped read model 展示 Brief、proposal、design、specs 和 tasks
- **AND** 页面 MUST 验证该 Change 引用属于当前 Task

#### Scenario: Buildr Web 尝试通过 Change 修改 Task
- **WHEN** 浏览器请求包含 `addChanges`、`removeChanges` 或 Change-specific prompt 的 Buildr Web 路由
- **THEN** HTTP interface MUST 在 Application mutation 前拒绝该请求
- **AND** Task Record 与 OpenSpec artifacts MUST 保持不变

#### Scenario: 未关联真实 Task 的 Change
- **WHEN** Workspace 中存在没有真实 Task Record 引用的 Change
- **THEN** Buildr Web MUST NOT 在本次能力中列出、扫描、关联或处置该 Change
- **AND** Buildr Web MUST NOT 将其显示为待处理 Task 或空态计数

### Requirement: Buildr Web 必须展示保存的终态交付事实
Buildr Web 的任务终态投影 MUST 展示最近一次 Finish 已保存的 terminal association snapshot，并明确其为交付时事实。页面读取 MUST NOT 因当前 Review、Verification 或 Development 状态变化而重新推导历史交付关联。

#### Scenario: 已完成 Task 打开终态信息
- **WHEN** 用户读取已有 terminal association snapshot 的已完成 Task
- **THEN** HTTP interface MUST 通过 Application 返回保存的 handoff/gate 关联
- **AND** Web 页面 MUST 将其呈现为最近一次正式交付采用的事实

### Requirement: Buildr Web HTTP interface 必须托管构建产物并支持 SPA 深链
Buildr Web HTTP interface MUST 从 Buildr Web 构建产物目录提供 `index.html` 与静态资产，并 MUST 在注入本机 session token 与可选 preview identity 后返回 shell。对已登记 Workspace 的应用深链（非 `/api/`），当请求不是已声明的静态资产时，HTTP interface MUST 返回同一注入后的 `index.html`，以便 React Router 恢复路由。静态托管 MUST 限制为构建产物内可证明的资产，MUST NOT 递归托管任意未纳入产物清单的远程或用户路径。

#### Scenario: 深链恢复
- **WHEN** 用户直接打开 `/workspaces/<workspaceId>/tasks/<taskId>` 之类的 Buildr Web 深链
- **THEN** HTTP interface MUST 返回注入 session 的构建产物 `index.html`
- **AND** 客户端 MUST 能够恢复对应 Task 详情路由

#### Scenario: API 与静态资源分离
- **WHEN** 请求路径以 `/api/` 开头
- **THEN** HTTP interface MUST 走既有 API 处理
- **AND** MUST NOT 将 API 请求回退为 `index.html`

#### Scenario: preview meta 保持
- **WHEN** Buildr Web 以 preview 实例启动
- **THEN** 返回的 shell MUST 继续注入 preview identity 信息
- **AND** 页面 MUST 能显示 preview 身份条且不得改写 `Buildr Web Dev.app` identity

### Requirement: Buildr Web 必须通过 Task Finish Application 投影 current 与 terminal 状态
Terminal Delivery Application MUST从Workspace SQLite中的唯一`task_finish_current` authority形成read model；Buildr Web HTTP/Web MUST只消费该Application结果，不得直接查询SQLite、读取phase detail、扫描或配对legacy Finish files、读取transient diagnostics、恢复run、计算live identity或读取lifecycle projection。terminal delivered判断 MUST只使用同Task且与保存Development handoff匹配的compact terminal association；非terminal current row只用于展示进行中、blocked、failed或cleanup pending状态。

#### Scenario: Finish 正在执行
- **WHEN** Task存在非terminal Finish current row
- **THEN** Buildr Web MUST展示current phase、有界状态、更新时间与唯一next action
- **AND** MUST NOT把Task显示为delivered、读取完整stdout/stderr或触发resume

#### Scenario: Finish cleanup pending
- **WHEN** delivery已证明但Environment或Finish-owned cleanup尚未完成
- **THEN** Buildr Web MUST显示“交付清理中”或匹配的blocked状态
- **AND** MUST NOT提前显示Task completed或terminal delivered成功语义

#### Scenario: Finish terminal completion
- **WHEN** Application返回与Task/Development保存identity匹配且`status: complete`的compact terminal current association
- **THEN** Buildr Web MUST以其commit/ref、remote readback、Doctor、cleanup与完成时间投影“已交付”
- **AND** GET MUST不访问Git、remote、Environment provider、旧四表、legacy files、transient root或已删除lifecycle table

#### Scenario: legacy store 残留
- **WHEN** `.buildr/task-finish`仍存在但SQLite中没有matching terminal current
- **THEN** Buildr Web MUST不扫描、不读取、不把legacy文件当作交付authority
- **AND** MUST只展示SQLite-backed Application read model；旧目录清理由升级步骤负责

### Requirement: Buildr Web 静态资源托管必须继续归属 buildr 且不因前端 Service 拆分改变安全模型
在 `buildr-web` 拥有前端源码后，Buildr MUST 继续由 `product/buildr` 的 Buildr Web HTTP interface 在 loopback 上同源托管已纳入的构建产物。写保护 MUST 继续要求当前应用 Origin、有效 session token 与 JSON content type。拆分 MUST NOT 引入分域 CORS 写路径、远程 CDN 静态依赖，或要求运行时读取 `buildr-web` 源码树。

#### Scenario: 拆分后仍同源托管 dist
- **WHEN** 用户通过 `buildr web`、已安装 npm package 或 launcher 打开 Buildr Web
- **THEN** 页面 MUST 使用 `buildr` 内已包含的 Buildr Web 构建产物静态资源
- **AND** MUST NOT 依赖 CDN、远程字体、远程脚本或远程图片
- **AND** MUST NOT 要求运行时从 `buildr-web` 或其他远程位置拉取前端源码

#### Scenario: 拆分后写保护不变
- **WHEN** 写请求来自当前应用 Origin，携带有效 session token、JSON content type、允许大小的请求体和当前 revision
- **THEN** Buildr MUST 将请求交给对应 Application 用例
- **AND** Origin 不匹配或缺少有效 session 时 MUST 在 Application mutation 前拒绝

### Requirement: Buildr Web HTTP 必须开放 Task-scoped execution record 只读接口
Buildr Web HTTP interface MUST 在解析已登记 Workspace 后提供 Task-scoped execution record list、detail 与 body-file GET。List MUST 只接受 closed `view=all|verification|finish`，detail/body MUST 同时验证 record 属于 route Task；所有响应 MUST 使用 `no-store`。HTTP interface MUST 只调用 Task Execution Record Application，MUST NOT 直接查询 SQLite、读取 locator、扫描文件系统或提供 mutation。

#### Scenario: 按 view 查询记录
- **WHEN** browser 请求 Task execution record list 且 view 合法
- **THEN** HTTP MUST 返回 Application 的 portable list read model
- **AND** 未提供 view 时 MUST 使用 `all`

#### Scenario: 查询 detail 与正文
- **WHEN** browser 请求 Task-scoped record detail 或受支持 filename
- **THEN** HTTP MUST 通过 Application 验证 Task/record/file identity 后返回 portable JSON
- **AND** MUST NOT 接受 body、locator 或 path query

#### Scenario: 非法查询参数
- **WHEN** request 包含未知 view、未知 filename 或额外查询字段
- **THEN** HTTP MUST 在读取 record body 前返回 closed-input diagnostic

### Requirement: Execution Record 读取必须进入 bounded Buildr Web read executor
Buildr Web bounded read executor MUST 登记 execution-record list、detail 与 body-file 三项纯读 operation，并 MUST 以 closed Worker message 传递已解析 Workspace root、Task ID 和 operation 所需最小参数。Executor MUST 保持既有固定 Worker/queue 容量、取消和 failure isolation 语义，且 MUST NOT 承载 execution record mutation、cleanup、GC 或 Doctor。

#### Scenario: 正常读取
- **WHEN** HTTP 提交合法 execution record read operation
- **THEN** bounded executor MUST 在 Worker runtime 调用同一 Application 并返回其 read model

#### Scenario: 队列饱和或取消
- **WHEN** executor 队列已满或 request 被取消
- **THEN** request MUST 使用既有 bounded-read diagnostic 结束
- **AND** MUST NOT 在 HTTP 主线程回退执行正文读取

## MODIFIED Requirements

### Requirement: 本地应用写 API 必须使用最小安全边界
Buildr MUST 保护本地页面的写操作，避免其他网页或任意路径输入利用本地应用修改 Workspace。

#### Scenario: 合法同源写请求
- **WHEN** 写请求来自当前应用 Origin，携带有效 session token、JSON content type、允许大小的请求体和当前 revision
- **THEN** Buildr MUST 将请求交给对应 Application 用例

#### Scenario: 非法写请求
- **WHEN** 写请求缺少有效 session token、Origin 不匹配、content type 不合法、请求体超限或包含任意目标 path
- **THEN** Buildr MUST 在 Application mutation 前拒绝请求
- **AND** Workspace 文件 MUST 保持不变

#### Scenario: 离线静态资源
- **WHEN** 用户加载本地应用页面
- **THEN** 页面 MUST 使用 Buildr npm package（或等价 launcher bundle）内已包含的 Buildr Web 构建产物静态资源
- **AND** MUST NOT 依赖 CDN、远程字体、远程脚本或远程图片
- **AND** MUST NOT 要求运行时从远程仓库拉取前端源码

### Requirement: 本机应用必须管理多个已登记 Workspace
Buildr MUST 在现有 Workspace 产品能力中维护本机登记 root 列表，并 MUST 以各 root 的 `.buildr/workspace.yml` 作为 Workspace 信息的事实来源。

#### Scenario: 登记已有 Workspace
- **WHEN** 用户选择包含有效 canonical `.buildr/workspace.yml` 的目录进行登记
- **THEN** Application MUST 将规范化 root 原子加入本机登记列表
- **AND** 页面 MUST 使用目标 Workspace 的真实 id、name 和 description 展示该项
- **AND** 登记 MUST NOT 修改目标 Workspace

#### Scenario: 重复登记同一路径
- **WHEN** 用户再次登记已经存在的同一规范化 root
- **THEN** Application MUST 返回已有 Workspace 并保持登记列表幂等

#### Scenario: 移除 Workspace 登记
- **WHEN** 用户确认从 Buildr Web 移除已登记 Workspace
- **THEN** Application MUST 只删除本机 root 记录
- **AND** MUST NOT 修改或删除目标目录及其中任何资产

#### Scenario: 已登记路径不可用
- **WHEN** 已登记 root 不存在、不可读取或不再包含有效 Workspace
- **THEN** 全局页面 MUST 显示可解释的不可用状态
- **AND** 其他已登记 Workspace MUST 继续可用

#### Scenario: Workspace identity 冲突
- **WHEN** 不同已登记 root 解析为相同 canonical Workspace id
- **THEN** Buildr MUST 报告 identity conflict
- **AND** MUST NOT 自动选择、合并或改写任一 Workspace

### Requirement: 普通用户必须能够启动和退出本机 Web 应用
Buildr MUST 提供无需用户理解命令行、端口或进程的可双击启动入口，并 MUST 在 Web 页面提供明确的安全退出操作。

#### Scenario: macOS 双击启动入口
- **WHEN** 普通用户双击已安装的 macOS `Buildr Web.app` launcher
- **THEN** launcher MUST 启动或复用 Buildr Web 并在默认浏览器打开页面
- **AND** launcher MUST NOT 创建 Desktop WebView 或第二套 UI
- **AND** macOS application bundle MUST 声明并携带可识别的 Buildr application icon

#### Scenario: Windows 双击启动入口
- **WHEN** 普通用户点击 Windows 开始菜单或桌面的 Buildr 图标
- **THEN** Windows launcher MUST 启动或复用同一个 Buildr Web 并在默认浏览器打开页面
- **AND** launcher MUST NOT 要求用户预先配置 Node、npm 或 PATH
- **AND** 桌面和开始菜单快捷方式 MUST 使用随包交付的 Buildr icon

#### Scenario: 关闭浏览器页面
- **WHEN** 用户关闭 Buildr 浏览器标签页或窗口
- **THEN** Buildr server MUST 继续运行
- **AND** 用户再次使用启动入口时 MUST 能重新打开已有实例

#### Scenario: 从页面退出 Buildr
- **WHEN** 当前同源页面携带有效 session 发起退出并得到用户确认
- **THEN** server MUST 停止接受新请求、清理当前 runtime state 并退出进程
- **AND** MUST 保留 Workspace 登记列表和所有 Workspace 源资产

#### Scenario: 非法退出请求
- **WHEN** 退出请求缺少有效 Origin、session token 或允许的请求格式
- **THEN** server MUST 拒绝退出并继续运行

### Requirement: 开发 launcher 必须支持安全的重复构建和本机更新
Buildr MUST 为 development checkout 提供 canonical launcher 安装入口，并 MUST 使用 stage、verify、switch 更新独立的 development thin launcher；该 launcher MUST 绑定 checkout，而不是复制 Buildr application 或 Node runtime 快照。

#### Scenario: 首次安装开发 launcher
- **WHEN** 开发者从 Buildr Service checkout 执行 canonical 安装入口
- **THEN** Buildr MUST 在 staging 构建带 source root、checkout identity 和受管 Node identity 的 thin bundle
- **AND** thin bundle MUST NOT 包含 Node executable、Node 动态库、Buildr `src/`、`package/` 或 `node_modules`
- **AND** MUST 验证后安装为隔离的 `Buildr Web Dev`
- **AND** macOS 默认目标 MUST 为 `/Applications/Buildr Web Dev.app`
- **AND** macOS launcher MUST 作为不驻留 Dock 的后台入口运行

#### Scenario: 源码修改后启动 development launcher
- **WHEN** checkout 的 `src/`、Web resource 或 migration 已改变，但 source root 和 Node identity 仍有效
- **THEN** development launcher MUST 在重启服务后读取当前 checkout 内容
- **AND** MUST NOT 要求重新复制 Node 或 Buildr application

#### Scenario: 更新正在使用的开发 launcher
- **WHEN** 已安装 launcher 或服务仍使用旧 thin bundle
- **THEN** 更新流程 MUST 先构建并验证新版本，再安全退出旧实例并等待释放
- **AND** MUST NOT 原地覆盖运行中的 bundle

#### Scenario: 开发 launcher 切换失败
- **WHEN** 新 bundle 验证、退出、安装切换或启动核对失败
- **THEN** 更新流程 MUST 保留或恢复上一已验证版本
- **AND** MUST 返回失败阶段、旧版本状态、staging 位置和恢复建议

#### Scenario: 开发 launcher 更新成功
- **WHEN** 新 thin bundle 已原子安装且启动核对通过
- **THEN** 诊断 MUST 显示 source root、checkout identity、Node identity、安装目标和运行 identity
- **AND** 旧 staging MUST 清理而不影响正式 App

### Requirement: Launcher 卸载必须保留用户工作资产
Buildr MUST 按安装渠道提供 launcher 卸载能力，并 MUST 默认保留 Workspace Registry、日志和全部 Workspace 源资产。

#### Scenario: 卸载官方 launcher
- **WHEN** 用户通过平台卸载入口移除 Buildr Web
- **THEN** installer MUST 移除其拥有的 bundle、快捷方式和卸载登记
- **AND** MUST NOT 删除任何已登记 Workspace 或其中的源资产

#### Scenario: 清理开发 launcher
- **WHEN** 开发者执行 canonical 开发 launcher 清理入口
- **THEN** Buildr MUST 只停止并移除 development channel 拥有的实例、bundle、快捷方式和 staging 产物
- **AND** MUST NOT 修改正式 launcher、npm CLI 或 Workspace 源资产

### Requirement: 本机应用必须提供范围明确的开始工作 Agent 交接
Buildr MUST 允许用户从当前 Workspace 选择 canonical Project、可选 Service 并填写工作目标，生成可复制的开始工作 prompt；该能力 MUST 只完成范围交接，不得连接、启动或托管 Agent 会话。

#### Scenario: 生成 Project-scoped 开始工作 prompt
- **WHEN** 用户选择当前 Workspace 中存在的 Project、未选择 Service并填写非空目标
- **THEN** Application MUST 生成包含 Workspace 与 Project 可读身份和用户目标的 prompt
- **AND** prompt MUST 要求 Agent 读取适用工作资产、确认必要歧义、推进任务并按 Project policy 验证

#### Scenario: 生成 Service-scoped 开始工作 prompt
- **WHEN** 用户选择当前 Project 下存在的 Service 并填写非空目标
- **THEN** Application MUST 生成包含 Workspace、Project、Service 可读身份和用户目标的 prompt
- **AND** prompt MUST NOT 把 current branch、dirty 或其他瞬时 observation 写成稳定声明

#### Scenario: 开始工作范围无效
- **WHEN** Project 不属于当前 Workspace、Service 不属于当前 Project或任一 entity 已不存在
- **THEN** Application MUST 在生成 prompt 前拒绝请求
- **AND** MUST NOT回退到其他 Workspace、Project 或 Service

#### Scenario: 复制开始工作 prompt
- **WHEN** 浏览器成功复制开始工作 prompt
- **THEN** 页面 MUST 提示用户回到 Agent 对话中粘贴该指令
- **AND** MUST 明确任务尚未在 Buildr Web 中开始或完成

#### Scenario: 开始工作写安全边界
- **WHEN** prompt 请求包含 filesystem path、未知字段、无效 session、错误 Origin、非 JSON 或超限 body
- **THEN** HTTP interface MUST 在 Application 处理前拒绝请求
- **AND** MUST 保持 Workspace 源资产和用户级 Registry 零写入

### Requirement: Task 概览必须以关联 Change Brief 为主要说明
Buildr Web MUST 仅在 Task 详情概览中，从该 Task Record 已保存的 Change 引用读取关联 Change，并 MUST 将每个可用的 Change Brief 作为主要人类可读说明。Task title、intent、范围和其他 Task 专业事实 MUST 保持可读，但 MUST NOT 取代 Brief 成为关联 Change 的主要说明。

#### Scenario: 查看含 Brief 的关联 Change
- **WHEN** 用户打开一个含有可解析 Change 引用且该 Change 提供 Brief 的 Task 概览
- **THEN** 页面 MUST 在概览中展示该 Brief 的原始人类可读内容和 Change identity
- **AND** 页面 MUST 提供从当前 Task 进入该 Change 技术 artifacts 的 Task-scoped 链接

#### Scenario: 一个 Task 关联多个 Change
- **WHEN** Task Record 保存多个 Change 引用
- **THEN** 页面 MUST 按每个已保存引用分别展示可用 Brief 或其不可用状态
- **AND** 页面 MUST NOT 推断、标记或合并任一“主 Change”

#### Scenario: Brief 或关联 Change 不可用
- **WHEN** 已保存的 Change 引用无法解析，或可解析 Change 没有 Brief
- **THEN** 页面 MUST 展示该引用的真实 unavailable 状态
- **AND** Task 的 title、intent 和其他可用事实 MUST 继续可读
- **AND** 页面 MUST NOT 生成、保存、推断或从全局目录查找 Brief

#### Scenario: Task 没有关联 Change
- **WHEN** Task Record 没有 Change 引用
- **THEN** 页面 MUST 显示明确的无关联 Change 状态
- **AND** 页面 MUST NOT 扫描 Workspace、Project 或 Task Environment 以发现 Change

### Requirement: 首次开始工作必须触发scope内Declaration Intake
Buildr Web生成Start Work Agent prompt时 MUST要求Agent在任务分流前只读检查所选Project及可选Service的Preparation与Verification声明。Prompt生成 MUST不读取代码树来生成声明候选，也 MUST不写Project文件。

#### Scenario: Project-only开始工作
- **WHEN** 用户选择Project但不选择Service
- **THEN** prompt MUST触发Project-only Declaration Intake
- **AND** MUST明确Service不是必需范围

#### Scenario: Service-scoped开始工作
- **WHEN** 用户选择一个Service开始工作
- **THEN** prompt MUST触发Project与该Service的Declaration Intake
- **AND** MUST不检查或安装未选择Service

### Requirement: Parent coordination 接口必须共享同一 Application
CLI与Buildr Web MUST调用同一Parent Coordination Application执行inspect、record、reconcile与final acceptance actions；interface MUST NOT直接查询SQLite、扫描文件系统或在GET中回填状态。

#### Scenario: CLI 与 HTTP 读取同一 Parent
- **WHEN** 两个client读取同一Parent identity
- **THEN** 两者 MUST返回相同Parent Plan、Child Contribution与prerequisite facts
- **AND** GET MUST保持零mutation effects

### Requirement: mutation 必须使用 current identity 并受界面安全保护
Parent Plan reconciliation与final acceptance mutation MUST使用expected current identity；Buildr Web HTTP MUST另外执行same-origin、session与closed JSON校验。

#### Scenario: 陈旧页面提交reconciliation
- **WHEN** expected Parent Plan identity与current不一致
- **THEN** Application MUST返回conflict且零写入
- **AND** client MUST刷新current read model后再决定

## REMOVED Requirements

### Requirement: Buildr App 必须以单实例本机 Web 服务运行
Buildr MUST 启动或复用一个只监听 loopback 的全局本机 Web 服务，并 MUST 在服务就绪后打开默认浏览器。

#### Scenario: 首次启动 App
- **WHEN** 当前用户没有健康的 Buildr App 实例
- **THEN** `buildr app` MUST 启动一个全局实例、记录可验证的 runtime state 并打开默认浏览器

#### Scenario: 重复启动 App
- **WHEN** 当前用户已经存在通过 Buildr health handshake 的实例
- **THEN** 启动入口 MUST 复用已有实例并重新打开浏览器
- **AND** MUST NOT 再启动一个 server

#### Scenario: 恢复陈旧实例状态
- **WHEN** runtime state 指向不存在或无法通过带实例 secret 的 health handshake 的进程
- **THEN** Buildr MUST 安全替换陈旧状态并启动新实例
- **AND** MUST 保留持久 Workspace 登记列表

#### Scenario: 开发环境不打开浏览器
- **WHEN** 调用方使用 `buildr app --no-open`
- **THEN** Buildr MUST 启动或复用实例但 MUST NOT 打开浏览器

#### Scenario: 兼容指定 Workspace 启动
- **WHEN** 调用方使用 `buildr app --target <workspace>`
- **THEN** Buildr MUST 验证并登记该 Workspace、启动或复用全局实例，并打开其 Workspace route

### Requirement: 平台安装必须提供完整且可解释的 Buildr App
Buildr MUST 为 macOS 和 Windows 提供不依赖用户预装 Node、npm 或 PATH 的平台安装产物，并 MUST 将安装、启动和后台常驻保持为不同动作。

#### Scenario: macOS 安装 Buildr App
- **WHEN** 普通用户完成 macOS 平台安装
- **THEN** 系统 MUST 提供带正确名称、图标、版本和独立 runtime 的 `Buildr.app` 启动入口
- **AND** 安装 MUST NOT 无提示启动 Buildr 或注册登录启动

#### Scenario: Windows 安装 Buildr App
- **WHEN** 普通用户完成 Windows 平台安装
- **THEN** 系统 MUST 提供带正确名称、图标、版本和独立 runtime 的开始菜单入口
- **AND** 桌面快捷方式 MUST 由安装选择明确决定
- **AND** 安装 MUST NOT 要求用户配置命令行环境

#### Scenario: 安装完成后显式打开
- **WHEN** 安装完成界面提供“打开 Buildr”且用户明确选择该动作
- **THEN** installer MUST 通过已安装 launcher 启动 Buildr
- **AND** 后续行为 MUST 与用户日常点击同一 launcher 一致

### Requirement: Buildr App 首次启动必须引导建立 Workspace 上下文
Buildr MUST 在用户级 Workspace Registry 为空时提供可理解的首次运行页面，解释 Workspace → Project → Service 最小模型，并 MUST 复用全局 Web 应用而不是在 installer 中维护第二套 Workspace 流程。

#### Scenario: 首次打开空 Registry
- **WHEN** 用户第一次打开 Buildr App 且 Workspace Registry 为空
- **THEN** 页面 MUST 说明 Workspace、Project 与 Service 分别代表什么以及三者关系
- **AND** MUST 将“添加已有工作空间”作为主操作，将“让 Agent 创建工作空间”作为次操作
- **AND** MUST NOT 首先展示 Change、Rules、Skills、runtime 或 CLI 教学

#### Scenario: 选择已有 Workspace
- **WHEN** 首次运行用户选择一个包含合法 Buildr Workspace identity 的目录
- **THEN** Buildr MUST 登记该 Workspace 并进入其“开始”页
- **AND** MUST NOT 复制、迁移或修改 Workspace 源资产

#### Scenario: 选择未初始化目录
- **WHEN** 用户通过 native directory picker 选择可读取但尚未初始化的目录
- **THEN** Buildr MUST 保持 Registry 不变并显示该目录尚不是 Buildr Workspace
- **AND** 页面 MUST 提供重新选择和生成带该 candidate 位置的 Workspace 初始化 Agent Action
- **AND** 页面 MUST NOT 自动执行 init

#### Scenario: 选择需要迁移或修复的目录
- **WHEN** picker 选择的目录存在 migration required、invalid metadata 或可恢复诊断
- **THEN** Buildr MUST 保持 Registry 不变并展示稳定、可理解的诊断类别
- **AND** 页面 MUST 提供重新选择和生成 canonical sync/repair Agent Action
- **AND** MUST NOT 自动选择 identity、覆盖文件或执行迁移

#### Scenario: 选择不可读或 identity 冲突目录
- **WHEN** picker 选择的目录不可读或与已登记 Workspace identity 冲突
- **THEN** Buildr MUST 保持 Registry 不变并说明不能登记的原因
- **AND** MUST NOT 生成声称可以安全自动修复的结果

#### Scenario: 暂不登记 Workspace
- **WHEN** 用户选择稍后处理
- **THEN** Buildr MUST 保持全局应用可退出
- **AND** MUST NOT 创建虚构 Workspace 或自动扫描磁盘

### Requirement: Local App 必须生成受限 Task Verification Agent prompt
本机应用 MAY 在 Task“证据”视图的验证结果区块提供 Agent Action 以生成 Task Verification prompt。prompt MUST 绑定正式 Task ID、Task Intent 和可选调用方已知 target identity，指导 Agent 读取 v3 Skill、inspect current Result、恢复 ready Environment、执行适用声明能力，并只在完整结论后通过 Application record；复制 prompt 本身 MUST NOT 等于 recorded。

#### Scenario: 用户请求开始验证
- **WHEN** 用户从 Task“证据”视图的验证结果区块触发 Agent Action
- **THEN** prompt MUST明确execution evidence与Workspace-local current Result分离、中断不覆盖和coverage gap边界
- **AND** Local App MUST 不执行测试、不生成 target identity、不写 Result

#### Scenario: terminal Task 请求新验证
- **WHEN** Task Record 已是 completed 或 abandoned
- **THEN** prompt Application MUST fail closed
- **AND** 已有 Result 仍可只读查看

### Requirement: Local App Task 视图必须只消费 Workspace structured Task read model
Buildr Local App MUST 继续通过 Task Record Application 列出、查看和维护 Workspace Task，并 MUST 将 SQLite repository 保持为 interface 后的本地 infrastructure。页面和 HTTP interface MUST NOT 读取旧 `task.yml`、打开数据库、执行 SQL、解释 migration ledger 或暴露 database path/table/row id。Local App MUST 先通过已登记 Workspace identity 将请求解析为 root，再由 Task Application 消费该 root 的 structured Task read model；对已经解析 root 的只读调用 MUST NOT 执行 Git/worktree provenance 校验或 `git rev-parse`。Local App 的 Task mutation MUST NOT 添加、移除或以其他方式维护 Change 引用。

#### Scenario: 浏览 SQLite-backed Task 列表
- **WHEN** 用户进入已登记 Workspace 的 Task 列表
- **THEN** API MUST 通过 Task Application 返回该 Workspace root 的 SQLite authority 中真实 Task 的排序 read model
- **AND** 页面 MUST NOT 扫描 `.buildr/tasks/`、合并旧 YAML 或按 Task 专业目录推断缺失记录

#### Scenario: canonical root 读取不依赖 Git
- **WHEN** 已登记 Workspace registry 将 `workspaceId` 解析为 canonical root，且用户读取 Task 列表或详情
- **THEN** API MUST 通过 Application 和 Structured Store 返回 read model
- **AND** 该只读路径 MUST NOT 调用 Git/worktree observer、`git rev-parse` 或重新判断 root provenance

#### Scenario: candidate 或 validation root 读取自身 store
- **WHEN** candidate 或 validation Workspace 已有自身 local structured store，且 Application 读取该 Workspace 的 Task
- **THEN** API MUST 只读取该 root 的 store
- **AND** MUST NOT 打开 retained canonical store 或修改任一 store

#### Scenario: 数据库尚未初始化
- **WHEN** 已登记 Workspace 尚无 structured store 且用户打开 Task 列表
- **THEN** API MUST 返回成功的空 Task 集合
- **AND** GET 请求 MUST NOT 创建数据库、目录或 migration ledger

#### Scenario: 数据库不可用
- **WHEN** Task Application 返回 schema drift、version newer、busy、corruption 或 integrity diagnostic
- **THEN** Local App MUST 显示稳定、可操作的 Workspace Task unavailable 状态
- **AND** MUST NOT 静默显示空列表、自动重建数据库、回退旧 YAML 或把 SQL/本机 path 暴露给浏览器

#### Scenario: Local App 修改 Task
- **WHEN** 用户通过受保护的 Task API 创建、更新、完成或放弃 Task
- **THEN** HTTP interface MUST 只提交明确 action input 和适用的 `expectedRecordDigest` 给 Task Application
- **AND** Local App update input MUST NOT 接受 `addChanges` 或 `removeChanges`
- **AND** HTTP interface MUST NOT 接受 SQL、database path、table、row id、migration version 或完整 next-state document

### Requirement: Local App 必须动态投影和维护 Parent Task 层级
Local App Task 列表与详情 MUST 通过 Task Record Application read model 展示直接 Parent/Children；active Task 的创建与编辑 MUST 允许选择或清除合法 Parent，并 MUST 复用 expected `recordDigest` 冲突边界。

#### Scenario: 查看协调 Task
- **WHEN** 用户打开拥有直接 Children 的 Task 详情
- **THEN** 页面 MUST 展示可导航的直接 Child 列表及每个 Child 的真实 status
- **AND** MUST NOT 把 Child completed 自动显示为 Parent completed 或整体目标已满足

#### Scenario: 查看 Child Task
- **WHEN** 用户打开带 Parent 的 Child Task
- **THEN** 页面 MUST 展示可导航的 Parent identity、title 与真实 status
- **AND** MUST NOT 复制 Parent 的专业 Result 到 Child

#### Scenario: 编辑 Parent 发生冲突
- **WHEN** 页面读取后 Parent/Child 关系已被其他产品动作改变
- **THEN** mutation MUST 因 expected `recordDigest` 陈旧而 fail closed
- **AND** 页面 MUST 要求刷新而不是自动合并

#### Scenario: terminal Task 层级只读
- **WHEN** Task 已 completed 或 abandoned
- **THEN** 页面 MUST 保留 Parent/Children 投影并禁用关系 mutation
- **AND** MUST NOT 提供自动处置关联 Task 的按钮

### Requirement: Local App 必须以 Application terminal projection 展示 Task 交付事实
Local App Task详情 MUST保持“概览、研发、证据、复盘、环境”五个一级页签，并 MUST只通过Application read model获取current/terminal facts。“概览”MUST调用Task Overview Application的一次SQLite联表读取；其他页签MUST继续调用所属专业Application reader。HTTP/Web MUST NOT直接读取SQLite、扫描Finish JSON、计算live identity、接受target/root/path filesystem query或依赖独立lifecycle projection；Terminal Delivery Application MUST只查询Task、Development与唯一Finish current保存事实。

#### Scenario: completed delivered Task
- **WHEN** terminal projection返回delivered
- **THEN** 研发页主结论 MUST显示“已交付”，并展示交付时Task context、planning disposition、Content Target、verification policy、Candidate/generation与Development handoff
- **AND** MUST展示final commit/ref、完成时间与Environment cleanup为正常结果
- **AND** GET MUST NOT扫描Finish Result、恢复Environment或观察Git

#### Scenario: completed noChange Task
- **WHEN** Task completed且result.noChange为true
- **THEN** 页面 MUST显示“已完成，无需交付变更”
- **AND** MUST NOT要求或伪造Finish Result

#### Scenario: completed Task 缺少匹配 Finish
- **WHEN** Task completed、非noChange且Finish terminal current没有matching association
- **THEN** 页面 MUST显示“已完成，但交付未经证明”
- **AND** MUST NOT使用delivered的绿色成功语义或从其他来源补造

#### Scenario: terminal 证据视图
- **WHEN** terminal projection从Finish terminal current返回Review/Verification delivery association
- **THEN** 证据页 MUST使用“已随交付候选采用”与“已随交付目标验证通过/未通过”等交付时文案
- **AND** MUST将active保存值匹配关系与terminal association分开表达，不得在读取时重算live applicability

#### Scenario: 技术详情与单卡宽度
- **WHEN** 页面展示SHA、digest、`workspace-sqlite:` locator或单一Verification Result
- **THEN** 技术标识 MUST位于次要或可展开详情，Verification单卡 MUST使用合理最大宽度
- **AND** Agent生成的原始evidence内容 MUST保持原文，不由Web翻译或改写

Task Finish MAY请求Development Application针对一个允许的carrier root重观测complete Content Target，但MUST NOT创建Candidate。只有carrier Content Target与handoff Candidate绑定的target逐component相等且Task context/policy仍current时，Application MUST返回equivalent；否则MUST返回Development handoff失效。上述Finish动作完成后 MUST写入Finish terminal association；读取terminal Task时不得重新执行该重观测。

#### Scenario: 只增加delivery commit
- **WHEN** Finish机械提交当前内容但所有scope bytes与逻辑语义未变化
- **THEN** carrier equivalence MUST通过且Candidate identity保持不变
- **AND** commit、branch与ref MUST不进入Content Target或Candidate identity

#### Scenario: carrier prepare改变内容
- **WHEN** rebase、sync、archive、生成或冲突处理改变任一component identity
- **THEN** equivalence MUST失败并判定current handoff失效
- **AND** Finish MUST退出到Development重新验证和生成Candidate

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

### Requirement: Local App 必须将 Change 限定为 Task-scoped 只读内容
Local App MUST 只通过当前 Task 的已保存 Change 引用读取 Change 内容。HTTP/Web MUST NOT 提供 Local App 的 Change 创建、修改、关联、移除、继续、审查、同步或归档操作；这些 Change 动作 MUST 保持为 Agent 在 Task 过程中使用相应 authority 推进的工作。

#### Scenario: 查看关联 Change 的完整 artifacts
- **WHEN** 用户从 Task 概览打开关联 Change
- **THEN** 页面 MUST 只通过 `/tasks/<task-id>/changes/<project>/<change>` 的 Task-scoped read model 展示 Brief、proposal、design、specs 和 tasks
- **AND** 页面 MUST 验证该 Change 引用属于当前 Task

#### Scenario: Local App 尝试通过 Change 修改 Task
- **WHEN** 浏览器请求包含 `addChanges`、`removeChanges` 或 Change-specific prompt 的 Local App 路由
- **THEN** HTTP interface MUST 在 Application mutation 前拒绝该请求
- **AND** Task Record 与 OpenSpec artifacts MUST 保持不变

#### Scenario: 未关联真实 Task 的 Change
- **WHEN** Workspace 中存在没有真实 Task Record 引用的 Change
- **THEN** Local App MUST NOT 在本次能力中列出、扫描、关联或处置该 Change
- **AND** Local App MUST NOT 将其显示为待处理 Task 或空态计数

### Requirement: Local App 必须展示保存的终态交付事实
Local App 的任务终态投影 MUST 展示最近一次 Finish 已保存的 terminal association snapshot，并明确其为交付时事实。页面读取 MUST NOT 因当前 Review、Verification 或 Development 状态变化而重新推导历史交付关联。

#### Scenario: 已完成 Task 打开终态信息
- **WHEN** 用户读取已有 terminal association snapshot 的已完成 Task
- **THEN** HTTP interface MUST 通过 Application 返回保存的 handoff/gate 关联
- **AND** Web 页面 MUST 将其呈现为最近一次正式交付采用的事实

### Requirement: Local App HTTP interface 必须托管构建产物并支持 SPA 深链
Buildr Local App HTTP interface MUST 从 Local App Web 构建产物目录提供 `index.html` 与静态资产，并 MUST 在注入本机 session token 与可选 preview identity 后返回 shell。对已登记 Workspace 的应用深链（非 `/api/`），当请求不是已声明的静态资产时，HTTP interface MUST 返回同一注入后的 `index.html`，以便 React Router 恢复路由。静态托管 MUST 限制为构建产物内可证明的资产，MUST NOT 递归托管任意未纳入产物清单的远程或用户路径。

#### Scenario: 深链恢复
- **WHEN** 用户直接打开 `/workspaces/<workspaceId>/tasks/<taskId>` 之类的 Local App 深链
- **THEN** HTTP interface MUST 返回注入 session 的构建产物 `index.html`
- **AND** 客户端 MUST 能够恢复对应 Task 详情路由

#### Scenario: API 与静态资源分离
- **WHEN** 请求路径以 `/api/` 开头
- **THEN** HTTP interface MUST 走既有 API 处理
- **AND** MUST NOT 将 API 请求回退为 `index.html`

#### Scenario: preview meta 保持
- **WHEN** Local App 以 preview 实例启动
- **THEN** 返回的 shell MUST 继续注入 preview identity 信息
- **AND** 页面 MUST 能显示 preview 身份条且不得改写 `Buildr Dev.app` identity

### Requirement: Local App 必须通过 Task Finish Application 投影 current 与 terminal 状态
Terminal Delivery Application MUST从Workspace SQLite中的唯一`task_finish_current` authority形成read model；Local App HTTP/Web MUST只消费该Application结果，不得直接查询SQLite、读取phase detail、扫描或配对legacy Finish files、读取transient diagnostics、恢复run、计算live identity或读取lifecycle projection。terminal delivered判断 MUST只使用同Task且与保存Development handoff匹配的compact terminal association；非terminal current row只用于展示进行中、blocked、failed或cleanup pending状态。

#### Scenario: Finish 正在执行
- **WHEN** Task存在非terminal Finish current row
- **THEN** Local App MUST展示current phase、有界状态、更新时间与唯一next action
- **AND** MUST NOT把Task显示为delivered、读取完整stdout/stderr或触发resume

#### Scenario: Finish cleanup pending
- **WHEN** delivery已证明但Environment或Finish-owned cleanup尚未完成
- **THEN** Local App MUST显示“交付清理中”或匹配的blocked状态
- **AND** MUST NOT提前显示Task completed或terminal delivered成功语义

#### Scenario: Finish terminal completion
- **WHEN** Application返回与Task/Development保存identity匹配且`status: complete`的compact terminal current association
- **THEN** Local App MUST以其commit/ref、remote readback、Doctor、cleanup与完成时间投影“已交付”
- **AND** GET MUST不访问Git、remote、Environment provider、旧四表、legacy files、transient root或已删除lifecycle table

#### Scenario: legacy store 残留
- **WHEN** `.buildr/task-finish`仍存在但SQLite中没有matching terminal current
- **THEN** Local App MUST不扫描、不读取、不把legacy文件当作交付authority
- **AND** MUST只展示SQLite-backed Application read model；旧目录清理由升级步骤负责

### Requirement: Local App 静态资源托管必须继续归属 buildr 且不因前端 Service 拆分改变安全模型
在 `buildr-web` 拥有前端源码后，Buildr MUST 继续由 `product/buildr` 的 Local App HTTP interface 在 loopback 上同源托管已纳入的构建产物。写保护 MUST 继续要求当前应用 Origin、有效 session token 与 JSON content type。拆分 MUST NOT 引入分域 CORS 写路径、远程 CDN 静态依赖，或要求运行时读取 `buildr-web` 源码树。

#### Scenario: 拆分后仍同源托管 dist
- **WHEN** 用户通过 `buildr app`、已安装 npm package 或 launcher 打开 Local App
- **THEN** 页面 MUST 使用 `buildr` 内已包含的 Local App 构建产物静态资源
- **AND** MUST NOT 依赖 CDN、远程字体、远程脚本或远程图片
- **AND** MUST NOT 要求运行时从 `buildr-web` 或其他远程位置拉取前端源码

#### Scenario: 拆分后写保护不变
- **WHEN** 写请求来自当前应用 Origin，携带有效 session token、JSON content type、允许大小的请求体和当前 revision
- **THEN** Buildr MUST 将请求交给对应 Application 用例
- **AND** Origin 不匹配或缺少有效 session 时 MUST 在 Application mutation 前拒绝

### Requirement: Local App HTTP 必须开放 Task-scoped execution record 只读接口
Local App HTTP interface MUST 在解析已登记 Workspace 后提供 Task-scoped execution record list、detail 与 body-file GET。List MUST 只接受 closed `view=all|verification|finish`，detail/body MUST 同时验证 record 属于 route Task；所有响应 MUST 使用 `no-store`。HTTP interface MUST 只调用 Task Execution Record Application，MUST NOT 直接查询 SQLite、读取 locator、扫描文件系统或提供 mutation。

#### Scenario: 按 view 查询记录
- **WHEN** browser 请求 Task execution record list 且 view 合法
- **THEN** HTTP MUST 返回 Application 的 portable list read model
- **AND** 未提供 view 时 MUST 使用 `all`

#### Scenario: 查询 detail 与正文
- **WHEN** browser 请求 Task-scoped record detail 或受支持 filename
- **THEN** HTTP MUST 通过 Application 验证 Task/record/file identity 后返回 portable JSON
- **AND** MUST NOT 接受 body、locator 或 path query

#### Scenario: 非法查询参数
- **WHEN** request 包含未知 view、未知 filename 或额外查询字段
- **THEN** HTTP MUST 在读取 record body 前返回 closed-input diagnostic

### Requirement: Execution Record 读取必须进入 bounded Local App read executor
Local App bounded read executor MUST 登记 execution-record list、detail 与 body-file 三项纯读 operation，并 MUST 以 closed Worker message 传递已解析 Workspace root、Task ID 和 operation 所需最小参数。Executor MUST 保持既有固定 Worker/queue 容量、取消和 failure isolation 语义，且 MUST NOT 承载 execution record mutation、cleanup、GC 或 Doctor。

#### Scenario: 正常读取
- **WHEN** HTTP 提交合法 execution record read operation
- **THEN** bounded executor MUST 在 Worker runtime 调用同一 Application 并返回其 read model

#### Scenario: 队列饱和或取消
- **WHEN** executor 队列已满或 request 被取消
- **THEN** request MUST 使用既有 bounded-read diagnostic 结束
- **AND** MUST NOT 在 HTTP 主线程回退执行正文读取
