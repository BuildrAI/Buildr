# Local Workspace Application

## Purpose

定义 Buildr Workspace 产品切片在新源码分层中的职责、本机应用入口、受控 metadata 修改、并发保护和 Agent prompt 边界。
## Requirements

### Requirement: Workspace 产品能力必须遵守新源码分层
Buildr MUST 将 Workspace 实体与纯约束放入 Domain，将用例和 ports 放入 Application，将 Manifest 持久化放入 filesystem Infrastructure，并将 CLI、HTTP 和 Web 放入 Interfaces。

#### Scenario: interface 读取 Workspace
- **WHEN** CLI、本机 HTTP 或 Web 请求读取 Workspace
- **THEN** interface MUST 调用 Application 暴露的 Workspace 用例
- **AND** interface MUST NOT 直接解析 `.buildr/workspace.yml` 或 `skills/manifest.yml`

#### Scenario: Domain 保持存储无关
- **WHEN** 架构 verifier 检查 Workspace Domain imports
- **THEN** Domain MUST NOT 导入 YAML、filesystem、HTTP、CLI、process、runtime、test 或 repository implementation
- **AND** Domain MUST 只表达 Workspace entity、identity 格式和字段约束

#### Scenario: filesystem adapter 持久化 Workspace
- **WHEN** Workspace Application 通过 repository port 读取或保存 Workspace
- **THEN** filesystem adapter MUST 负责 Manifest path、YAML parse/render 和 canonical bytes revision
- **AND** adapter MUST NOT 自行决定页面字段白名单、identity 冲突取舍或 Agent prompt 内容

### Requirement: Workspace 页面必须支持查看和低风险修改
Buildr MUST 提供 Workspace 总览与编辑页面，只允许修改 `name` 和 `description`。

#### Scenario: 查看 Workspace
- **WHEN** 用户打开 Workspace 总览
- **THEN** 页面 MUST 展示 Workspace `id`、`name`、`description`、root path 和当前 revision
- **AND** `id`、root path 与 schema identity MUST 为只读信息

#### Scenario: 修改 Workspace metadata
- **WHEN** 用户基于当前 revision 提交合法的 `name` 或 `description`
- **THEN** Application MUST 使用 Workspace transaction 和 atomic writer 更新 `.buildr/workspace.yml`
- **AND** 写后 MUST 重新校验 canonical schema
- **AND** 响应 MUST 返回更新后的 Workspace 和新 revision

#### Scenario: 拒绝非白名单字段
- **WHEN** 页面或调用方尝试修改 Workspace `id`、root path、schemaVersion 或任意未知字段
- **THEN** Application MUST 在写入前拒绝整个请求
- **AND** `.buildr/workspace.yml` MUST 保持不变

### Requirement: 页面修改必须防止覆盖外部变化
Buildr MUST 返回基于 canonical Manifest bytes 的 revision，并对页面修改执行 compare-and-swap。

#### Scenario: revision 匹配
- **WHEN** 修改请求携带的 revision 与写入前实际 revision 相同
- **THEN** Application MUST 继续执行字段校验和受控写入

#### Scenario: revision 冲突
- **WHEN** Agent、Git、编辑器或另一个页面会话已经改变 Manifest，导致请求 revision 过期
- **THEN** Application MUST 返回稳定 conflict 结果
- **AND** MUST NOT 自动 merge 或覆盖实际文件
- **AND** 页面 MUST 提示用户刷新后重新判断

### Requirement: 新增 Workspace 必须生成可复制 Agent prompt
Buildr MUST 让 Workspace 新增页面生成完整 prompt，而不是直接初始化目标目录或声称 Workspace 已创建。

#### Scenario: 生成 Workspace 新增 prompt
- **WHEN** 用户填写 Workspace 名称、说明和可选目标位置并请求生成
- **THEN** Application MUST 返回可直接复制到 Agent 对话框的 prompt
- **AND** prompt MUST 要求 Agent 读取 Buildr Skill、核对目标位置和授权、补充必要信息、执行 canonical init/sync 并验证结果
- **AND** prompt MUST NOT 猜测用户未提供的路径、runtime 或权限

#### Scenario: 复制 prompt
- **WHEN** 用户点击复制且浏览器复制成功
- **THEN** 页面 MUST 显示复制成功反馈
- **AND** 页面 MUST 明确说明复制不等于 Workspace 已创建

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
- **THEN** 页面 MUST 使用 Buildr npm package（或等价 launcher bundle）内已包含的 Local App 构建产物静态资源
- **AND** MUST NOT 依赖 CDN、远程字体、远程脚本或远程图片
- **AND** MUST NOT 要求运行时从远程仓库拉取前端源码

### Requirement: 本地应用必须提供 Project 列表与详情
Buildr MUST 在固定 Workspace 的本地应用中提供 Project read model，且 Interfaces MUST 通过 Project Application 查询。

#### Scenario: 查看 Project 列表
- **WHEN** 用户打开本地应用的 Projects 视图
- **THEN** 页面 MUST 展示每个 Project 的 code、name、description、source type 和 path
- **AND** 页面 MUST 标识 registry migration state

#### Scenario: 查看 Project 详情
- **WHEN** 用户选择一个 Project
- **THEN** 页面 MUST 展示 id、workspaceId、code、name、description、source declaration 和 registry revision
- **AND** Git Project MUST 展示可用的实时 Git observation 与 declared/observed diagnostics

#### Scenario: Git 状态不可用
- **WHEN** Git adapter cannot observe a Project within its bounded query
- **THEN** page MUST show an unavailable diagnostic without treating guessed values as facts
- **AND** Workspace and other Project information MUST remain readable

### Requirement: Project 页面必须支持低风险 metadata 修改
Buildr MUST allow Project `name` and `description` edits while keeping identity and source read-only.

#### Scenario: 保存 Project metadata
- **WHEN** 用户基于当前 registry revision 保存合法 name 或 description
- **THEN** HTTP interface MUST invoke Project Application update with compare-and-swap
- **AND** page MUST refresh the returned canonical Project and revision

#### Scenario: Project revision 冲突
- **WHEN** Agent、Git、编辑器或另一个页面会话 changed `projects/manifest.yml` after the page loaded
- **THEN** API MUST return conflict without write
- **AND** page MUST ask the user to refresh and reassess

#### Scenario: v1 registry 只读
- **WHEN** registry requires migration
- **THEN** page MUST keep Project data readable and disable mutation
- **AND** page MUST show a copyable Agent instruction for canonical update or sync

### Requirement: 新增 Project 必须生成可复制 Agent prompt
Buildr MUST 以普通用户可理解的业务意图生成完整 Agent prompt，而不是直接修改 Project registry、创建目录或 clone repo；Project code 与 Git 执行声明 MUST 可以由用户显式提供，也 MUST 可以留给 Agent 提议并确认。

#### Scenario: 生成最小 Project 意图 prompt
- **WHEN** 用户填写 Project 名称和用途，并且没有填写 code、source 或 Git 声明
- **THEN** Application MUST 返回要求 Agent 核对当前 Workspace、提出可读 code、确认 source boundary、执行 canonical Project creation 并验证结果的 prompt
- **AND** 页面 MUST 明确说明复制 prompt 不会创建 Project
- **AND** 页面 MUST NOT 要求用户先理解 Project asset repo、remote 或 integration branch

#### Scenario: 生成 workspace Project prompt
- **WHEN** 用户填写名称、用途和可选 code，并明确选择 workspace source
- **THEN** prompt MUST 保留用户提供的声明并要求 Agent 确认目标 Workspace、物化路径和 root Git boundary
- **AND** prompt MUST 要求 Agent 使用 canonical Project creation 并验证结果

#### Scenario: 生成 Git Project prompt
- **WHEN** 用户提供独立 Project asset Git URL、remote 或 integration branch
- **THEN** prompt MUST 保留已经提供的声明并要求 Agent 校验 remote identity、路径、授权和稳定集成目标
- **AND** 未提供的技术声明 MUST 由 prompt 要求 Agent 解析或询问，不得由页面猜测
- **AND** prompt MUST NOT 要求 Buildr 盲目切换、stash 或重连既有 checkout

### Requirement: Project HTTP 写操作必须复用本地应用安全边界
Project write routes MUST use the same fixed-target, same-origin, token, JSON and body-size controls as Workspace writes.

#### Scenario: 合法 Project 写请求
- **WHEN** request comes from the current Origin with valid token, JSON body, allowed size and current revision
- **THEN** server MUST pass only Project code, allowed metadata and revision to Application

#### Scenario: 非法 Project 写请求
- **WHEN** request contains target path, filesystem path, invalid token/origin/content type, oversized body or unknown mutation fields
- **THEN** server MUST reject it before Application mutation
- **AND** Project registry MUST remain unchanged

### Requirement: 本地应用必须提供 Service 列表与详情
固定 Workspace 的本地应用 MUST 按 Project 展示 Service Domain、声明 source 与实时观察状态。

#### Scenario: 查看 Service 列表
- **WHEN** 用户选择一个 Project
- **THEN** 页面 MUST 展示该 Project 的 Service code、name、type、description 与 source 类型

#### Scenario: 查看 Git Service 详情
- **WHEN** 用户选择 Git Service
- **THEN** 页面 MUST 分开展示 Domain 声明和 current branch、HEAD、dirty、upstream、ahead/behind、remote URL 与 comparison findings

### Requirement: Service 页面必须支持低风险 metadata 修改
本地应用 MUST 只允许修改 Service `name`、`description` 与 `type`。

#### Scenario: 保存 Service metadata
- **WHEN** 用户提交允许字段和当前 revision
- **THEN** HTTP API MUST 通过 Service Application 原子保存并刷新真实结果

#### Scenario: Service registry 需要迁移
- **WHEN** 当前 registry 是 legacy schema
- **THEN** 页面 MUST 保持修改只读并展示由 Agent 执行显式 update/sync 的提示

### Requirement: 新增 Service 必须生成可复制 Agent prompt
本地应用 MUST 将新增 Service 保持为 prompt-only Agent Action，并 MUST 从当前 Workspace 的 canonical Project 中选择所属关系；用户 MUST 能以名称、用途和可选来源开始，而不需要先填写完整 CLI 参数。

#### Scenario: 生成最小 Service 意图 prompt
- **WHEN** 用户选择一个已登记 Project，填写 Service 名称和用途，并且没有填写 code、type 或 repo ref
- **THEN** 页面 MUST 生成要求 Agent 核对 Project identity、确认是否存在代码仓或可执行资产、补齐必要声明并调用 canonical CLI 的 prompt
- **AND** prompt MUST NOT 假设每个 Project 都必须创建 Service

#### Scenario: 生成本地来源 prompt
- **WHEN** 用户选择 canonical Project 并提供本地目录
- **THEN** 页面 MUST 生成要求 Agent 核对来源、物化路径、Git boundary、code/type 候选、调用 canonical CLI 并验证的完整 prompt
- **AND** 页面 MUST NOT 直接复制目录、创建外部链接或写 registry

#### Scenario: 生成 Git 来源 prompt
- **WHEN** 用户选择 canonical Project 并提供 Git URL、remote 或 integration branch
- **THEN** prompt MUST 保留已经提供的稳定声明并要求 Agent 在写入前检查既有 repo、metadata identity 和授权
- **AND** 未提供的 code、type、remote 或 integration branch MUST 由 Agent 解析或询问，不得由页面猜测

#### Scenario: 拒绝未知所属 Project
- **WHEN** Service prompt 请求中的 Project 不属于当前 Workspace 或已经不存在
- **THEN** Application MUST 在生成 prompt 前拒绝请求
- **AND** MUST NOT 回退到第一个 Project 或其他 Workspace

### Requirement: Service HTTP 写操作必须复用本地应用安全边界
Service API MUST 复用 fixed target、loopback、session token、Origin、JSON、body size 与 revision conflict 约束。

#### Scenario: 非法写请求
- **WHEN** Service PATCH 或 prompt 请求缺少任一写安全条件
- **THEN** server MUST 拒绝请求且零写入

### Requirement: Workspace 概览必须提供真实且可解释的摘要
Buildr MUST 将 Workspace 概览呈现为“开始”页，根据真实 Workspace、全部 Project 与 Service read model 展示当前工作范围、完整性和一个明确的下一步；页面 MUST NOT 持久化第二套 onboarding 状态、Project 选择状态，或把 Service 数量作为 Workspace readiness 的硬门禁。

#### Scenario: Workspace 没有 Project
- **WHEN** Workspace 与 Project read model 可读取且 Project registry 为空
- **THEN** 开始页 MUST 用普通语言说明 Workspace 与 Project 的关系
- **AND** MUST 将“让 Agent 创建第一个 Project”作为主要下一步
- **AND** MUST NOT 优先展示 Change、Rules、Skills 或技术 identity

#### Scenario: Workspace 有多个 Project
- **WHEN** Project read model 返回多个 Project
- **THEN** 开始页 MUST 展示整个 Workspace 的 Project 数量和进入项目目录的明确入口
- **AND** MUST NOT 在开始页要求、保存或锁定当前 Project
- **AND** MUST NOT 猜测当前业务范围或把任一 Project 标记为唯一正确选择

#### Scenario: Workspace 中没有 Service
- **WHEN** 全部可读取 Project 的 Service read model 均为空
- **THEN** 开始页 MUST 解释 Service 是代码仓、应用、模块或可执行资产
- **AND** MUST 说明 Service 对开始工作是可选范围，而非 Workspace 完成门槛
- **AND** MUST NOT 将该 Workspace 显示为未完成或不可用

#### Scenario: 已有可用工作范围
- **WHEN** Workspace、Project 与可读取 Service read model 均可读取
- **THEN** 开始页 MUST 展示当前 Workspace、Project 总数和可选 Service 总数
- **AND** MUST 将“用 Agent 开始”作为主要动作
- **AND** Project 数、Service 数、identity、schema 和 revision MUST 保持为次级摘要或技术信息

#### Scenario: 开始任务时选择临时范围
- **WHEN** 用户从开始页打开“用 Agent 开始”
- **THEN** 应用 MUST 在生成 prompt 前要求用户选择本次任务的 Project，并允许选择该 Project 的 Service
- **AND** 此选择 MUST 只用于当前 prompt
- **AND** 关闭、刷新或重新打开开始页后 MUST NOT 作为 Workspace 或开始页状态恢复

#### Scenario: 部分 Service 汇总不可用
- **WHEN** 至少一个 Project 的 Service read model 无法读取或需要迁移
- **THEN** 开始页 MUST 将 Service 汇总和 onboarding completeness 标识为部分不可用
- **AND** MUST NOT 将未知数量显示为完整事实
- **AND** Workspace 与可用的 Project 信息 MUST 继续展示

#### Scenario: 存在迁移要求
- **WHEN** Workspace、Project 或 Service read model 报告 migration required
- **THEN** 开始页 MUST 展示需要 Agent 执行显式 update 或 sync 的提示和可复制 Agent Action
- **AND** 打开开始页 MUST NOT 触发任何迁移写入

#### Scenario: 旧 Project 查询参数打开开始页
- **WHEN** 用户访问带有 `project` 查询参数的开始页 URL
- **THEN** HTTP interface MUST 忽略该参数并返回 Workspace 范围的开始页 projection
- **AND** MUST NOT 将该参数保存、回显为当前 Project 或传给 Agent 工作动作

### Requirement: Workspace 设置必须承载受控 metadata 修改
Buildr MUST 将当前 Workspace 的 metadata 编辑与只读技术事实放在 Workspace 设置页面，并继续复用现有白名单、迁移只读和 revision compare-and-swap 契约。

#### Scenario: 查看 Workspace 设置
- **WHEN** 用户打开 `/settings/workspace`
- **THEN** 页面 MUST 展示可编辑的 `name`、`description`
- **AND** MUST 将 `id`、root path、schema identity 和 revision 显示为只读事实

#### Scenario: 保存 Workspace 设置
- **WHEN** 用户基于当前 revision 保存合法的 `name` 或 `description`
- **THEN** 页面 MUST 调用 Workspace Application 写入并刷新新 revision
- **AND** App Shell 中的当前 Workspace 名称 MUST 同步刷新

#### Scenario: Workspace 设置发生 revision conflict
- **WHEN** 外部 Agent、Git、编辑器或其他页面会话已改变 Workspace manifest
- **THEN** 设置页 MUST 提示用户刷新后重新判断
- **AND** MUST NOT 自动 merge 或覆盖真实文件

### Requirement: 项目与服务独立视图必须保留现有能力
Buildr MUST 为项目与服务提供独立管理视图和稳定的项目详情上下文，且二者现有 read、metadata update、diagnostic 和 prompt-only 行为 MUST 保持可用。

#### Scenario: 打开项目视图
- **WHEN** 用户访问 `/projects`
- **THEN** 页面 MUST 以表格只展示当前工作空间的项目目录和项目管理入口
- **AND** 每个项目 MUST 在操作栏提供进入其 canonical 详情 URL 和按项目过滤的服务管理入口
- **AND** PC 表格整行 MUST NOT 作为默认操作入口
- **AND** MUST NOT 同时渲染服务管理内容

#### Scenario: 直接打开项目详情
- **WHEN** 用户访问或刷新合法的 `/projects/:projectCode`
- **THEN** HTTP interface MUST 返回本机应用 shell
- **AND** 页面 MUST 展示对应项目的身份、说明、来源声明、实时观察和诊断状态
- **AND** 浏览器历史导航 MUST 能恢复同一项目上下文

#### Scenario: 项目详情展示所属服务
- **WHEN** 对应 Project 与 Service read model 均可读取
- **THEN** 项目详情 MUST 展示该项目的服务数量与服务列表
- **AND** MUST 提供进入服务管理和创建服务 Agent Action 的入口
- **AND** 创建服务 MUST 自动携带当前项目 code

#### Scenario: 项目没有服务
- **WHEN** 项目详情中的 Service read model 返回空列表
- **THEN** 页面 MUST 展示当前项目尚未登记服务的空状态
- **AND** MUST NOT 渲染虚构的服务详情或状态

#### Scenario: 项目不存在
- **WHEN** 项目详情 API 对 URL 中的 projectCode 返回 not found
- **THEN** 页面 MUST 展示项目不存在的明确错误状态
- **AND** MUST 提供返回项目目录的入口
- **AND** MUST NOT 回退展示其他项目

#### Scenario: 展示后续项目资产入口
- **WHEN** 项目详情展示 OpenSpec、规则、验证或命令入口但本阶段尚未提供对应 read model
- **THEN** 页面 MUST 明确标记该能力属于后续阶段
- **AND** MUST NOT 展示未经真实来源证明的数量、健康度或可编辑状态

#### Scenario: 打开服务视图
- **WHEN** 用户访问 `/services` 或携带合法项目查询参数
- **THEN** 页面 MUST 以表格明确展示当前所属项目并只列出该项目的服务
- **AND** 用户 MUST 能切换已登记项目来查看对应服务
- **AND** 每个服务 MUST 通过明确的“详情”操作进入现有详情与 metadata 修改能力
- **AND** PC 表格整行 MUST NOT 作为默认操作入口

#### Scenario: 窄屏查看管理表格
- **WHEN** 用户在窄屏查看项目或服务管理视图
- **THEN** 页面 MUST 保持信息可读且关键操作可用
- **AND** MAY 使用表格横向滚动而无需提供独立移动端管理流程

#### Scenario: 当前项目没有服务
- **WHEN** 当前所属项目的 Service read model 返回空列表
- **THEN** 页面 MUST 展示该项目尚未登记服务的空状态与创建服务入口
- **AND** MUST NOT 渲染空的服务详情表单

#### Scenario: 使用项目或服务写操作
- **WHEN** 用户在独立视图修改项目或服务 metadata 或生成创建 prompt
- **THEN** HTTP API MUST 继续执行已有 session、Origin、JSON、body size、字段白名单和 revision conflict 约束

### Requirement: 新 Workspace 动作必须统一表达为交给 Agent
Buildr MUST 在 App Shell 中提供“交给 Agent”入口来生成新 Workspace prompt，并 MUST 明确该动作不会切换当前 Workspace 或直接完成创建。

#### Scenario: 生成新 Workspace prompt
- **WHEN** 用户从 App Shell 打开 Agent Action 并填写名称、说明和可选目标位置
- **THEN** 页面 MUST 调用现有 Workspace prompt Application 用例
- **AND** MUST 展示可复制的完整 prompt

#### Scenario: 复制新 Workspace prompt
- **WHEN** prompt 成功复制
- **THEN** 页面 MUST 提示指令已复制但 Workspace 尚未创建
- **AND** 当前 App Shell MUST 继续显示原 Workspace 上下文

### Requirement: 项目与服务创建必须使用抽屉式 Agent Action
Buildr MUST 通过资源页面中的创建按钮触发统一的“交给 Agent”抽屉，并 MUST 使用“基础意图 + 高级声明”的渐进表单；页面正文 MUST NOT 平铺创建表单，抽屉 MUST NOT 把 canonical CLI 参数作为普通用户的默认必填项。

#### Scenario: 从项目区域创建项目
- **WHEN** 用户点击项目区域的“创建项目”按钮
- **THEN** 应用 MUST 打开以名称和用途为默认必填信息的 Project Agent Action
- **AND** code、source、Git remote 和 integration branch MUST 为可选或高级声明
- **AND** 表单 MUST 使用 Project prompt Application 用例

#### Scenario: 从服务区域创建服务
- **WHEN** 用户点击服务区域的“创建服务”按钮
- **THEN** 应用 MUST 打开以所属 Project、名称和用途为默认必填信息的 Service Agent Action
- **AND** 所属 Project MUST 从当前 Workspace canonical Project 列表选择，当前已选 Project MUST 自动带入
- **AND** code、type、repo ref、remote 和 integration branch MUST 为可选或高级声明
- **AND** 表单 MUST 使用 Service prompt Application 用例

#### Scenario: 用户未提供技术声明
- **WHEN** Project 或 Service Agent Action 缺少 code、type、source、remote 或 integration branch
- **THEN** 页面 MUST 允许生成 prompt
- **AND** prompt MUST 要求 Agent 根据真实目录、Git 与用户目标提出候选并只询问必要信息
- **AND** Application MUST NOT 为缺失字段编造声明

#### Scenario: 从全局入口选择创建类型
- **WHEN** 用户点击 App Shell 的“交给 Agent”按钮
- **THEN** 抽屉 MUST 优先展示创建 Workspace、Project、Service 和开始工作等核心动作
- **AND** Change 等后续能力 MUST 作为次级动作呈现
- **AND** 生成与复制结果 MUST 明确说明对象或任务尚未创建或开始

### Requirement: 界面领域名词必须使用中文主称
Buildr 本机应用 MUST 在用户可见界面中使用“工作空间”“项目”“服务”作为领域对象的主要名称，英文名称只能作为首次解释或技术辅助信息。任务页面及其直接的 Task-scoped 入口 MUST 对任务记录、任务环境、任务研发、审查结果、验证结果、内容目标、任务候选与研发交接使用纯中文或“中文（English Term）”主称，不得使用英文-only 标题或操作名。

#### Scenario: 展示导航和页面标题
- **WHEN** 应用展示工作空间、项目或服务的导航、面包屑、页面标题、按钮、状态或说明
- **THEN** 领域对象 MUST 分别使用“工作空间”“项目”“服务”
- **AND** MUST NOT 只使用 Workspace、Project 或 Service 作为用户可见主称

#### Scenario: 展示任务页面与直接入口
- **WHEN** 应用展示任务目录、任务详情页签、专业区块或 Task-scoped Change 的审查入口
- **THEN** 已有稳定中文名称的任务对象、专业能力、状态与操作 MUST 使用纯中文或“中文（English Term）”形式
- **AND** MUST NOT 只使用 Task Record、Task Environment、Task Review、Task Verification、Task Development、Planning Review 或 Completion Review 作为用户可见主称

#### Scenario: 展示技术字段
- **WHEN** 应用展示 Workspace ID、schemaVersion、digest、字段名、路径、Git 或 API 等精确技术标识
- **THEN** 应用 MAY 保留不可误译的英文标识和原始枚举值
- **AND** 标签与对象主称仍 MUST 使用中文，必要时在首次出现时补充英文术语

#### Scenario: 展示任务专业状态
- **WHEN** Task 页面展示 current、stale、missing、unknown、ready、passed、not-passed、proceed 或 blocked 等专业枚举
- **THEN** 用户可见主状态 MUST 使用稳定中文文案
- **AND** 原始枚举仅 MAY 作为次级技术信息，不得成为唯一可读结论

### Requirement: 本机应用必须使用统一的资源目录与独立详情模型
Buildr 本机应用 MUST 将已登记工作空间作为全局目录；进入工作空间后，Project、Service 和 Change MUST 分别提供资源目录和可刷新、可返回的独立详情 URL。资源目录 MUST NOT 承载完整详情或主编辑表单。

#### Scenario: 从服务目录进入详情
- **WHEN** 用户在 `/services` 中选择某个服务的“详情”操作
- **THEN** 页面 MUST 导航到 `/services/:projectCode/:serviceCode`（在工作空间 URL 前缀内）
- **AND** 服务目录 MUST NOT 在表格下方展开详情或编辑表单

#### Scenario: 直接打开服务详情
- **WHEN** 用户访问或刷新合法的 `/services/:projectCode/:serviceCode`
- **THEN** HTTP interface MUST 返回本机应用 shell，页面 MUST 读取并展示对应 Service
- **AND** 浏览器历史导航 MUST 恢复相同 Project 与 Service 上下文

#### Scenario: 详情页承载低风险编辑
- **WHEN** 用户在 Service 详情页保存合法的 name、description 或 type
- **THEN** 页面 MUST 使用既有 Service metadata API 和 revision CAS
- **AND** 保存、冲突和迁移只读反馈 MUST 明确且不得影响目录页

### Requirement: 本机应用必须以控制台级信息层级呈现资源
Buildr 本机应用 MUST 使用紧凑的工作控制台信息层级：中文为主语言、技术身份与 Git observation 为次级信息、稳定 metadata 编辑与资源目录分离，且所有创建动作 MUST 明示为交给 Agent 的 prompt-only 行为。

#### Scenario: 查看资源列表
- **WHEN** 用户打开 Project、Service 或 Change 目录
- **THEN** 页面 MUST 提供一致的标题、数量、过滤控件与“交给 Agent 创建”主操作
- **AND** 表格操作 MUST 使用一致的低强调详情链接或按钮，资源行本身不得同时承担主编辑流程

#### Scenario: 查看资源详情
- **WHEN** 用户打开 Project、Service 或 Change 详情
- **THEN** 页面 MUST 按页头、概览、稳定 metadata、技术信息和关联资源的层级展示真实 read model
- **AND** UUID、revision、路径、source 和 Git observation MUST 不占用主标题或主概览视觉

#### Scenario: 反映真实导航层级
- **WHEN** 用户在工作空间内浏览目录或详情
- **THEN** 应用 shell MUST 显示可理解的工作空间、资源与当前资源层级
- **AND** 侧边栏当前工作空间 MUST 只展示名称和截断路径，并提供返回工作空间目录的明确入口

### Requirement: 工作空间目录与资源视图必须在窄屏保持可用
Buildr 本机应用 MUST 在桌面、约 1024px 和 390px 宽度保持可读且主要操作可用，不让页面主容器发生横向溢出。

#### Scenario: 查看工作空间目录
- **WHEN** 用户在宽屏、中屏或窄屏打开工作空间目录
- **THEN** 工作空间卡片 MUST 分别以 2–3 列、2 列和 1 列等宽网格显示
- **AND** 同一张卡内的状态、路径和操作位置 MUST 保持一致，整卡可进入工作空间，移除操作为次级行为

#### Scenario: 在窄屏查看和编辑资源
- **WHEN** viewport 宽度为 390px
- **THEN** 资源目录、详情、稳定 metadata 表单与“交给 Agent”操作 MUST 可见并可操作
- **AND** 必要的表格横向滚动 MUST 限定在表格容器内

### Requirement: 资源详情与修改必须使用独立操作
Buildr 本机应用 MUST 将 Project 与 Service 的详情呈现保持为只读，并以统一的标签和值展示资源身份、稳定 metadata 与来源事实；技术信息 MUST 在折叠区内沿用相同的标签和值形式。修改稳定 metadata MUST 通过明确、独立的编辑操作和 URL 进入。Project 与 Service 详情 MUST NOT 内嵌所属关联资源的目录、卡片或跳转入口；关联资源跳转 MUST 由相应资源目录行的操作列提供。

#### Scenario: 查看只读资源详情
- **WHEN** 用户打开 Project 或 Service 详情
- **THEN** 页面 MUST 展示资源身份、说明、稳定 metadata 与技术信息
- **AND** 主事实与展开的技术信息 MUST 使用统一的标签和值形式
- **AND** 页面 MUST NOT 直接展示可编辑 input、textarea、保存按钮或关联资源跳转入口

#### Scenario: 从资源目录开始修改
- **WHEN** 用户在 Project 或 Service 目录中选择“编辑”操作
- **THEN** 页面 MUST 导航到对应资源的独立编辑 URL
- **AND** 编辑页面 MUST 保持现有 metadata 白名单、revision CAS、迁移只读与反馈语义

#### Scenario: 从资源目录访问关联资源
- **WHEN** 用户查看任一 Project 行
- **THEN** 操作列 MUST 仅提供该项目的服务目录入口
- **WHEN** 用户查看任一 Service 行
- **THEN** 操作列 MUST 提供所属 Project 详情入口
- **AND** Project 与 Service 详情 MUST NOT 重复提供这些关联资源跳转

#### Scenario: 侧边栏指示当前资源
- **WHEN** 用户打开项目、服务目录或其详情/编辑页
- **THEN** 相应侧边栏资源项 MUST 显示明显的当前状态
- **AND** 资源分组状态 MUST NOT 取代当前资源项的高亮

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
- **WHEN** 用户确认从 Buildr App 移除已登记 Workspace
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

### Requirement: 全局应用必须通过已登记 Workspace 身份隔离请求
Buildr MUST 让 Workspace 内页面和 API 使用已登记 `workspaceId` 作为上下文，并 MUST 在调用既有 Application 用例前由 server 解析和重新验证真实 root。

#### Scenario: 访问已登记 Workspace
- **WHEN** 请求包含已登记且 identity 匹配的 `workspaceId`
- **THEN** HTTP interface MUST 只把该 Workspace 的 root 交给对应 Application 用例
- **AND** 返回结果 MUST NOT 混入其他 Workspace 的事实

#### Scenario: 普通请求提交路径
- **WHEN** Workspace、Project、Service 或 Change 请求包含 target、root、path 或其他 filesystem path
- **THEN** HTTP interface MUST 在读取或修改 Workspace 前拒绝请求

#### Scenario: 访问未知 Workspace
- **WHEN** 请求中的 `workspaceId` 未登记、不可用或与 root 中的 canonical identity 不匹配
- **THEN** HTTP interface MUST 返回稳定的不可用或冲突结果
- **AND** MUST NOT 回退到当前目录或其他 Workspace

### Requirement: 全局应用必须提供 Workspace 级应用外壳与路由
Buildr MUST 提供解释 Workspace 心智的全局 Workspace 页面，并 MUST 在选定 Workspace 下提供“开始”、设置、Project、Service 和 Change 等既有稳定路由；应用外壳 MUST 将 Workspace、Project、Service 作为核心路径，并将 Change 与后续资产能力放入次级区域。

#### Scenario: 打开全局首页
- **WHEN** 用户打开根路由
- **THEN** 页面 MUST 展示全部已登记 Workspace 的真实身份和可用状态
- **AND** MUST 用普通语言说明 Workspace 是用户与 Agent 共同工作的顶层目录
- **AND** MUST 提供登记已有 Workspace、让 Agent 创建 Workspace、移除登记和进入 Workspace 的明确操作
- **AND** MUST 说明登记只保存本机入口，不移动或修改 Workspace 源资产

#### Scenario: 进入 Workspace
- **WHEN** 用户选择一个可用 Workspace
- **THEN** 页面 MUST 导航到 `/workspaces/:workspaceId/` 下的 Workspace“开始”页
- **AND** Workspace 内导航 MUST 保持该 `workspaceId` 上下文

#### Scenario: 展示核心导航层级
- **WHEN** 用户在选定 Workspace 中浏览
- **THEN** App Shell MUST 将“开始”“项目”“服务”展示为核心区域
- **AND** Service 视图 MUST 显示当前所属 Project，breadcrumb MUST 表达 Workspace、Project 与 Service 层级
- **AND** Change 与未来 Rules、Skills 等能力 MUST 进入次级区域但保持既有路由可访问

#### Scenario: 保持既有深链接
- **WHEN** 用户直接访问合法的 Project、Service、Change 详情或编辑 URL
- **THEN** HTTP interface MUST 继续返回本机应用 shell并恢复同一 canonical 上下文
- **AND** 本变更 MUST NOT 因导航重组破坏既有 `/projects`、`/services?project=`、详情或编辑路由

#### Scenario: 切换 Workspace
- **WHEN** 用户从 Workspace 内选择另一个已登记 Workspace
- **THEN** 页面 MUST 切换到目标 Workspace 的 canonical route
- **AND** MUST NOT 改变任一 Workspace 源资产

#### Scenario: 恢复最近使用项
- **WHEN** 全局实例启动且最近使用的 Workspace 仍可用
- **THEN** Buildr MUST 允许启动入口直接打开该 Workspace 的“开始”页
- **AND** 最近使用状态 MUST NOT 写入 Workspace 源资产

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

### Requirement: 普通用户必须能够启动和退出本机 Web 应用
Buildr MUST 提供无需用户理解命令行、端口或进程的可双击启动入口，并 MUST 在 Web 页面提供明确的安全退出操作。

#### Scenario: macOS 双击启动入口
- **WHEN** 普通用户双击已安装的 macOS `Buildr.app` launcher
- **THEN** launcher MUST 启动或复用 Buildr App 并在默认浏览器打开页面
- **AND** launcher MUST NOT 创建 Desktop WebView 或第二套 UI
- **AND** macOS application bundle MUST 声明并携带可识别的 Buildr application icon

#### Scenario: Windows 双击启动入口
- **WHEN** 普通用户点击 Windows 开始菜单或桌面的 Buildr 图标
- **THEN** Windows launcher MUST 启动或复用同一个 Buildr App 并在默认浏览器打开页面
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

### Requirement: 全局 Workspace 登记必须使用最小本机安全边界
Buildr MUST 将任意目录选择限制在显式登记用例中，并 MUST 保护登记文件和 Workspace 源资产不被普通 Web 请求越权访问。

#### Scenario: 合法登记请求
- **WHEN** 当前同源 session 通过受控目录选择或兼容 CLI 提供候选 root
- **THEN** Application MUST 在写登记列表前验证候选目录的 canonical Workspace identity

#### Scenario: 非法登记目录
- **WHEN** 候选目录不是有效 Buildr Workspace、不可读取或与已有 identity 冲突
- **THEN** Application MUST 拒绝登记或返回明确冲突
- **AND** 登记列表和候选目录 MUST 保持不变

#### Scenario: 并发修改登记列表
- **WHEN** 登记或移除请求携带的 registry revision 已过期
- **THEN** Application MUST 返回 conflict
- **AND** MUST NOT 覆盖另一页面或进程已经完成的修改

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

### Requirement: Launcher 必须暴露可诊断的运行身份和失败反馈
Buildr launcher MUST 携带版本、channel、构建来源和平台 identity，并 MUST 在启动失败、source checkout 不可用、受管 Node 缺失或版本不兼容时提供用户可见反馈。

#### Scenario: Launcher 成功启动
- **WHEN** launcher 启动或复用兼容的 Buildr 单实例
- **THEN** release launcher MUST 使用自身 bundle runtime，development launcher MUST 使用绑定 checkout 的当前 `bin/buildr.mjs` 启动或复用实例
- **AND** launcher MUST 使用实例返回的实际 loopback URL 打开默认浏览器
- **AND** 随机端口 MUST 保持为内部状态而不是用户配置

#### Scenario: Development launcher 成功启动
- **WHEN** 绑定 checkout、Buildr CLI 入口和受管 Node probe 均通过
- **THEN** launcher MUST 使用绑定 checkout 的当前 `bin/buildr.mjs` 启动或复用实例
- **AND** status MUST 报告 source root、observed checkout、Node identity 和运行实例 identity

#### Scenario: Development source checkout 不可用
- **WHEN** source root 被移动、删除、不是预期 Buildr Service checkout 或缺少 CLI 入口
- **THEN** launcher MUST 拒绝启动并输出 source root、原因、日志位置和重新安装 development launcher 的动作
- **AND** MUST NOT 回退到另一个 checkout、Release bundle 或 PATH 中的 Buildr

#### Scenario: Development Node runtime 不可用
- **WHEN** identity 指定的受管 Node executable 缺失、版本不匹配或不能启动
- **THEN** launcher MUST 拒绝启动并输出 Node version、runtime path、日志位置以及 `buildr sync`/重新安装动作
- **AND** MUST NOT 静默选择 PATH 中的另一个 Node

#### Scenario: Launcher 启动失败
- **WHEN** runtime 缺失、bundle 不完整、实例未就绪或浏览器打开失败
- **THEN** launcher MUST 显示简短错误、日志位置和重试动作
- **AND** MUST NOT 仅静默退出

#### Scenario: 已运行实例版本不兼容
- **WHEN** 现有实例与自身 App protocol 或 runtime identity 不兼容
- **THEN** launcher MUST 拒绝静默复用
- **AND** MUST 安全退出旧实例后启动当前版本，或明确告知阻塞原因

### Requirement: 开发 launcher 必须支持安全的重复构建和本机更新
Buildr MUST 为 development checkout 提供 canonical launcher 安装入口，并 MUST 使用 stage、verify、switch 更新独立的 development thin launcher；该 launcher MUST 绑定 checkout，而不是复制 Buildr application 或 Node runtime 快照。

#### Scenario: 首次安装开发 launcher
- **WHEN** 开发者从 Buildr Service checkout 执行 canonical 安装入口
- **THEN** Buildr MUST 在 staging 构建带 source root、checkout identity 和受管 Node identity 的 thin bundle
- **AND** thin bundle MUST NOT 包含 Node executable、Node 动态库、Buildr `src/`、`package/` 或 `node_modules`
- **AND** MUST 验证后安装为隔离的 `Buildr Dev`
- **AND** macOS 默认目标 MUST 为 `/Applications/Buildr Dev.app`
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
- **WHEN** 用户通过平台卸载入口移除 Buildr App
- **THEN** installer MUST 移除其拥有的 bundle、快捷方式和卸载登记
- **AND** MUST NOT 删除任何已登记 Workspace 或其中的源资产

#### Scenario: 清理开发 launcher
- **WHEN** 开发者执行 canonical 开发 launcher 清理入口
- **THEN** Buildr MUST 只停止并移除 development channel 拥有的实例、bundle、快捷方式和 staging 产物
- **AND** MUST NOT 修改正式 launcher、npm CLI 或 Workspace 源资产

### Requirement: Workspace onboarding 状态必须由真实资产派生
Buildr MUST 通过 Application 组合现有 Workspace、Project 与 Service read model 生成只读 Getting Started projection，并 MUST 区分完整、部分可用和需要处理的事实；该 projection MUST NOT 成为 Workspace readiness 或资源关系的第二事实源。

#### Scenario: 生成派生 onboarding phase
- **WHEN** 本机应用请求当前 Workspace 的 Getting Started projection
- **THEN** Application MUST 根据实际 Project 数、当前选择、Service 数和诊断生成 phase、primary action 与 completeness
- **AND** MUST 返回 primary action 所需的 canonical entity references
- **AND** MUST NOT 写入 Workspace、Project、Service 或用户级 Registry

#### Scenario: 资产状态随后变化
- **WHEN** Agent、Git 或另一个页面创建、删除、迁移或修改 Project/Service 后重新请求 projection
- **THEN** Application MUST 从最新 read model 重新计算结果
- **AND** MUST NOT 依赖已完成步骤、dismissed flag 或旧缓存决定下一步

#### Scenario: Service 对当前 Project 不适用
- **WHEN** 用户选择直接开始不含 Service 的 Project 工作
- **THEN** 页面 MUST 允许生成 Project-scoped 开始工作 prompt
- **AND** MUST NOT 创建虚构 Service 或持久化“跳过 Service”状态

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
- **AND** MUST 明确任务尚未在 local app 中开始或完成

#### Scenario: 开始工作写安全边界
- **WHEN** prompt 请求包含 filesystem path、未知字段、无效 session、错误 Origin、非 JSON 或超限 body
- **THEN** HTTP interface MUST 在 Application 处理前拒绝请求
- **AND** MUST 保持 Workspace 源资产和用户级 Registry 零写入

### Requirement: Task 详情必须只读投影 current Verification Result
本机应用 MUST在Task详情“证据”视图提供“验证结果（Verification Result）”区块，并 MUST通过Task Verification Application inspect展示Result presence、target、declarations、实际capability facts、coverage gaps、结论、resultDigest、record observedAt，以及与Development gate/显式保存identity的匹配关系。页面 MUST不直接读取Result YAML，不得伪造当前target identity，也不得暴露Result writer；GET MUST只查询SQLite专业current rows，不执行declaration、Content Target、Git或Environment observation。

#### Scenario: 查看已有 Result
- **WHEN** 用户打开Task的“证据”视图
- **THEN** API MUST返回Application的current read model并设置no-store
- **AND** 验证结果区块 MUST显示Result保存事实、record observedAt与保存identity的matched/mismatched/unknown关系
- **AND** GET MUST NOT执行declaration、Git、文件或Environment observation

#### Scenario: Result 不存在
- **WHEN** Task尚无current Verification Result
- **THEN** 验证结果区块 MUST显示空状态与“交给Agent验证”的动作
- **AND** Task Record、Environment、Development、Review与其他视图 MUST正常工作

#### Scenario: lifecycle snapshot 不存在
- **WHEN** Task有current Verification Result但没有保存Development verification gate
- **THEN** 验证结果区块 MUST显示已有Result与稳定unknown/not-adopted-yet关系
- **AND** GET MUST NOT为了补齐关系修改数据库、扫描外部声明或创建Development Receipt

#### Scenario: 尝试直接写 Result API
- **WHEN** 客户端向Task verification resource发送POST/PUT/PATCH/DELETE
- **THEN** 本机应用 MUST不提供该路由
- **AND** Task Record、Environment、Development、Review与已有Result bytes MUST保持不变

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

### Requirement: Task 概览必须以关联 Change Brief 为主要说明
Local App MUST 仅在 Task 详情概览中，从该 Task Record 已保存的 Change 引用读取关联 Change，并 MUST 将每个可用的 Change Brief 作为主要人类可读说明。Task title、intent、范围和其他 Task 专业事实 MUST 保持可读，但 MUST NOT 取代 Brief 成为关联 Change 的主要说明。

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

### Requirement: 首次开始工作必须触发scope内Declaration Intake
Local App生成Start Work Agent prompt时 MUST要求Agent在任务分流前只读检查所选Project及可选Service的Preparation与Verification声明。Prompt生成 MUST不读取代码树来生成声明候选，也 MUST不写Project文件。

#### Scenario: Project-only开始工作
- **WHEN**用户选择Project但不选择Service
- **THEN**prompt MUST触发Project-only Declaration Intake
- **AND** MUST明确Service不是必需范围

#### Scenario: Service-scoped开始工作
- **WHEN**用户选择一个Service开始工作
- **THEN**prompt MUST触发Project与该Service的Declaration Intake
- **AND** MUST不检查或安装未选择Service

### Requirement: Parent coordination 接口必须共享同一 Application
CLI与Local App MUST调用同一Parent Coordination Application执行inspect、record、reconcile与final acceptance actions；interface MUST NOT直接查询SQLite、扫描文件系统或在GET中回填状态。

#### Scenario: CLI 与 HTTP 读取同一 Parent
- **WHEN** 两个client读取同一Parent identity
- **THEN** 两者 MUST返回相同Parent Plan、Child Contribution与prerequisite facts
- **AND** GET MUST保持零mutation effects

### Requirement: mutation 必须使用 current identity 并受界面安全保护
Parent Plan reconciliation与final acceptance mutation MUST使用expected current identity；Local App HTTP MUST另外执行same-origin、session与closed JSON校验。

#### Scenario: 陈旧页面提交reconciliation
- **WHEN** expected Parent Plan identity与current不一致
- **THEN** Application MUST返回conflict且零写入
- **AND** client MUST刷新current read model后再决定

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
