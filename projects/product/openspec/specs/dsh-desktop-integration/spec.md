# dsh-desktop-integration Specification

## Purpose
规定 Buildr 在兼容的 DSH 桌面版中通过独立侧栏按钮打开正确渠道的 Buildr Web，并约束安装身份、健康检查、右侧页面行为与插件退出边界。

## Requirements

### Requirement: 侧栏入口使用官方已发布席位
DSH 桌面插件（Plugin）MUST 注册到兼容版本已发布的侧栏底部动作列表席位 `sidebar.footer.action`，在侧栏底部、Settings 旁显示名为 Buildr 的独立动作按钮；尺寸、间距、图标、字体、悬停及键盘反馈 SHALL 与相邻入口协调。实现 MUST 使用该正式扩展机制，不依赖生成类名、坐标、定时扫描或假主页面跳转，也不要求修改 DSH 源码或替换侧栏外壳。具体位置 MUST 在交付与验收报告中如实标注。

#### Scenario: 点击入口
- **WHEN** 用户在可用对话会话（Session）中点击 Buildr
- **THEN** 中间对话 MUST 保持不变
- **AND** 动作 MUST 只展示或打开右侧 Buildr 页面，不调用中间主页面导航

#### Scenario: 指定位置不可用时
- **WHEN** 需要“新会话下方、插件上方”的位置，而该位置只有候选补丁 `sidebar.action` 支持
- **THEN** 实施 MUST 保持当前已交付席位不变并报告差异、构建与签名前置及替代方案
- **AND** MUST NOT 擅自自建并替换用户正在使用的桌面应用、修改安装包或把条目挂到无关位置

### Requirement: 安装绑定与就绪地址
插件（Plugin）MUST 使用接入时明确绑定并核实的 Buildr 安装入口与渠道，执行公开的 `installation status --json`，仅接受 `buildr.installation-status/v1` 中目标实例 `status === "ready"` 且安装身份匹配时的 `identity.url`。正式版与开发版 MUST 分别选择 `instances.released` 与 `instances.development`，不得猜端口或解析人类日志。

#### Scenario: 正确实例已运行
- **WHEN** 绑定渠道的正确实例健康且身份匹配
- **THEN** 插件（Plugin）MUST 使用查询返回的地址
- **AND** MUST NOT 重复启动服务或改用另一个渠道

#### Scenario: 地址发生变化
- **WHEN** 正确实例已迁移到新的健康地址
- **THEN** 新打开操作 MUST 使用本次健康查询返回的地址，而非硬编码或过期缓存

#### Scenario: 安装缺失或不匹配
- **WHEN** 绑定安装缺失、入口无效或身份不匹配
- **THEN** 插件（Plugin）MUST 给出明确原因和重试或修复指引
- **AND** MUST NOT 自动猜测其他安装、重新绑定正式版或读取含秘密的内部回执

### Requirement: 有界静默启动
目标实例未运行时，插件（Plugin）MUST 复用已验证安装对应的既有启动器（Launcher），仅为相关子进程设置 `BUILDR_LAUNCHER_NO_OPEN=1`，并通过公开健康查询进行有超时的就绪等待。启动返回成功 MUST NOT 被当作服务已就绪。目标实例被 Buildr 报告为 `stale`（同一安装槽位的旧版本仍在运行）时视为未就绪实例：插件（Plugin）MUST 走同一 Launcher 启动路径，由 Buildr 完成旧实例的优雅交接，而不是将其当作外来实例拒绝。

#### Scenario: 目标尚未运行
- **WHEN** 用户点击且目标安装有效但实例未运行
- **THEN** 插件（Plugin）MUST 启动正确渠道并等待真实就绪
- **AND** MUST NOT 打开系统浏览器、修改全局环境或重复并发启动

#### Scenario: 同槽位旧版本实例重启交接
- **WHEN** `installation status` 将目标实例报告为 `stale`（运行版本落后于已安装版本但安装槽位可证明一致）
- **THEN** 插件（Plugin）MUST 启动对应渠道的 Launcher 并继续等待真实就绪
- **AND** MUST NOT 把该状态作为身份不匹配直接拒绝，也不得自行终止既有服务

#### Scenario: 启动失败或超时
- **WHEN** 启动命令失败或有界等待结束仍未就绪
- **THEN** 插件（Plugin）MUST 停止本次等待，显示简短原因并提供可重试操作
- **AND** MUST NOT 无限轮询或擅自终止既有服务

### Requirement: 右侧浏览器复用与安全
插件（Plugin）MUST 通过受支持的 DSH 右侧浏览器接口打开 Buildr 自身地址，并优先展示已有对应页面。插件（Plugin）MUST NOT 传递内部密钥到 DSH 页面、从 DSH 来源（Origin）跨域代发业务写请求，或放宽 Buildr 的禁止内嵌框架（iframe）安全响应头。

#### Scenario: 重复点击
- **WHEN** 同一 Buildr 页面已经打开，用户再次点击入口
- **THEN** 插件（Plugin）MUST 展示该页面而不新增重复页面、不无故导航或刷新
- **AND** MUST 保留页面中尚未保存的内容

#### Scenario: 没有可用会话
- **WHEN** 未选中对话或当前全局主页面没有挂载右侧栏
- **THEN** 插件（Plugin）MUST 给出清楚的不可用提示
- **AND** MUST NOT 偷偷创建会话（Session）、向智能体（Agent）发送消息或切换主页面

#### Scenario: 桌面实际加载
- **WHEN** 验收 DSH 桌面网页视图（WebView）承载
- **THEN** MUST 实测 Buildr 加载和正常导航，并与静态分析、构建和安装成功分别报告
- **AND** 任何业务写入验证 MUST 使用隔离数据，不改真实业务数据

### Requirement: 交付与退出边界
插件（Plugin）源资产 MUST 由 Buildr 产品工程维护，通过 DSH 支持的插件管理机制安装、更新、启用、禁用或卸载；MUST 遵守兼容性校验和依赖构建授权，不直接改写受管配置或应用安装包。

#### Scenario: 禁用或卸载
- **WHEN** 用户禁用或卸载本插件（Plugin）
- **THEN** 本插件（Plugin）的界面注册和监听 MUST 被清理
- **AND** MUST NOT 删除 Buildr 数据或擅自终止已经运行的 Buildr Web

#### Scenario: 需要重启
- **WHEN** 受支持管理机制要求重启 DSH
- **THEN** 智能体（Agent）MUST 说明对当前对话与后台工作的影响，等待用户安排
- **AND** MUST NOT 另起 DSH 服务并声称当前应用已更新

#### Scenario: 主题与会话变化
- **WHEN** 用户切换会话（Session）、收起侧栏或切换深浅主题
- **THEN** 按钮布局、可用性与已打开页面的行为 MUST 保持与宿主边界一致
- **AND** 不可保留的宿主行为 MUST 明确报告，不得伪造跨会话（Session）保存保证

#### Scenario: 通过 DSH 管理入口安装
- **WHEN** 用户授权安装或更新 Buildr 插件（Plugin）
- **THEN** 智能体（Agent）MUST 使用 DSH 支持的插件管理入口与已核实的包来源，不直接改写桌面配置档（Profile）
- **AND** 未公开的本地候选 MUST 只报告为本机安装；公开包的可安装性与真实桌面生效须分别核验

### Requirement: 开发实例健康与当前来源匹配须分别表达
Buildr SHALL 由安装身份责任主体比较当前开发来源与运行程序的来源目录、已提交版本和产品协议身份，并通过公开安装查询分别表达健康事实及当前安装匹配结果。DSH 插件 MUST 只接受已证明匹配的开发程序，MUST NOT 仅凭开发渠道、调用者运行环境或启动器构建编号认定匹配。缺少来源证明时 SHALL 给出重新启动或更新接入的明确诊断，不否定旧程序已成立的健康事实，不自行终止程序。

#### Scenario: 旧开发程序仍健康
- **WHEN** 当前开发来源已经变化而旧程序仍健康
- **THEN** 公开查询 MUST 保留其真实健康结果，并明确它不属于当前来源
- **AND** DSH MUST NOT 打开旧页面并返回当前安装身份

#### Scenario: 当前开发来源与旧记录
- **WHEN** 运行程序的来源、已提交版本及产品身份匹配，或旧记录缺少证明字段
- **THEN** 前者 MUST 可正常复用；后者 MUST 返回无法证明匹配的明确诊断而不猜测

### Requirement: 自动发现入口失效须有界恢复
DSH 插件 SHALL 区分显式绑定和自动发现。自动发现的入口已明确缺失或变化时，当前打开操作 SHALL 最多重新发现并重试一次，同一时间的打开操作 MUST 共享恢复结果。显式绑定 MUST NOT 自动改绑；查询、启动、来源匹配失败 MUST NOT 触发无关安装切换。插件退出时 MUST 取消自有操作，不再查询或启动。

#### Scenario: 自动发现路径迁移
- **WHEN** 首次发现的入口已经失效，而同一渠道存在新的有效登记
- **THEN** 下一次打开 MUST 有界重新发现并使用有效入口，不持续重试旧路径

#### Scenario: 显式绑定失效或恢复仍失败
- **WHEN** 显式绑定失效，或一次重新发现后仍不能打开
- **THEN** 插件 MUST 返回原有明确错误或缺失反馈，不无限重试或静默切换其他安装

### Requirement: 日常官方应用采用保全已有数据

恢复日常官方 DSH SHALL 先在可核验的官方发行物及隔离数据中验证增强插件（Plugin）的安装、停用、卸载、重装与来源界面。切换前 MUST 保全当前应用与实际数据目录，核对会话及必要配置；切换后 MUST 核对实际运行官方应用身份、原会话与无关配置，以及来源列、详情和 Buildr 页面可用。官方应用 MUST 不再依赖开发源码目录。任何未覆盖平台或场景 MUST 如实说明，不以隔离验证替代日常实际采用。

#### Scenario: 验证后恢复日常官方应用
- **WHEN** 隔离官方应用已完成必要验证并执行用户授权的日常切换
- **THEN** 官方应用使用原数据，原会话、模型及无关配置保持，增强能力由插件（Plugin）提供
- **AND** 旧应用和恢复数据保留，实际进程不引用开发目录作为应用入口
