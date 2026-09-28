## ADDED Requirements

### Requirement: 侧栏入口使用官方已发布席位
DSH 桌面插件（Plugin）MUST 注册到官方 `0.1.7-rc.2`（提交 `477b4f42`）已发布的侧栏底部动作列表席位 `sidebar.footer.action`，在侧栏底部、Settings 旁显示名为 Buildr 的独立动作按钮；尺寸、间距、图标、字体、悬停及键盘反馈 SHALL 与相邻入口协调。实现 MUST 使用该正式扩展机制，不依赖生成类名、坐标、定时扫描或假主页面跳转，也不要求修改 DSH 源码或替换侧栏外壳。具体位置 MUST 在交付与验收报告中如实标注。

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
目标实例未运行时，插件（Plugin）MUST 复用已验证安装对应的既有启动器（Launcher），仅为相关子进程设置 `BUILDR_LAUNCHER_NO_OPEN=1`，并通过公开健康查询进行有超时的就绪等待。启动返回成功 MUST NOT 被当作服务已就绪。

#### Scenario: 目标尚未运行
- **WHEN** 用户点击且目标安装有效但实例未运行
- **THEN** 插件（Plugin）MUST 启动正确渠道并等待真实就绪
- **AND** MUST NOT 打开系统浏览器、修改全局环境或重复并发启动

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

#### Scenario: 准备安装绑定的本地交付物
- **WHEN** 智能体（Agent）运行 `buildr runtime dsh-plugin prepare --channel <npm|development> --output <new-dir> --json`
- **THEN** 系统 MUST 仅选择公开状态证明的指定渠道安装，复核准确入口并生成私有绑定组合包
- **AND** 输出 MUST 使用 `buildr.dsh-plugin-delivery/v1`，区分 `prepared` 和已安装，返回 DSH 管理工具的安装、禁用与卸载输入
- **AND** 已存在输出、入口漂移、候选源码与安装身份不符或缺少编译产物 MUST 明确失败，不覆盖已有内容、不直接更改 DSH 配置

#### Scenario: 自动安装接口缺失
- **WHEN** DSH 不提供适配器（Adapter）可调用的受支持安装路径
- **THEN** 交付 MUST 明确该具体缺口，并分别报告独立插件（Plugin）验证与正式适配接入状态
- **AND** MUST NOT 将本机手工安装成功冒充自动交付维护已完成
