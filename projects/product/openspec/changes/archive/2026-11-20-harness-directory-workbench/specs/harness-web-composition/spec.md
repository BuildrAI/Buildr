## MODIFIED Requirements

### Requirement: Harness 必须提供完整唯一对话并支持公开同页装配

系统 MUST 将对话导航、历史、消息、工具展示、输入、附件、发送、模型与账号设置、问题、审批、停止、接续和恢复全部实现在 buildr-harness-web。独立 buildr-harness-ui 包 MUST 删除；Development MUST 通过公开完整对话组件入口装配，MUST NOT 导入内部组件重组对话或执行状态容器。第一方组合 MUST 使用同一 React 页面树，不加载对话 iframe；独立完整网页入口 MUST 继续可用。

Development 的 harness-ui 模块 MUST 只准备工程现场、选择工作空间、挂载完整对话、维护任务关联和工程导航；任务选择控件 MUST 由 Development 提供并通过语义上下文插槽原位呈现，MUST NOT 依赖跨窗口坐标覆盖。Harness MUST 不管理工程任务状态。Development MUST NOT 在外壳复制第二套收起态对话导轨、窄屏对话入口或分屏宽度分隔条；展开态与收起态导轨、分屏宽度分隔条 MUST 均由 buildr-harness-web 唯一提供并向宿主同步开合、宽度与停靠方位，Harness 通用对话与对话列表能力 MUST NOT 以专注模式或分屏模式作为功能门控。

上下文插槽 MUST 是可选工作上下文区域，而非工程任务专属空位；未提供内容时 MUST NOT 保留固定任务占位。文件能力与工作对象打开 MUST 由产品装配显式接入，Harness MUST NOT 将通用打开入口写死为 Development。通用资源管理器和源代码管理 MUST 由 Harness 提供可分别装配的入口；Development MUST 提供准确工程范围，在原导航与文件深链上复用通用界面，并继续拥有任务、跨库编排与交付。模块 MUST NOT 依赖对话对象、Development 私有状态或未装配的相邻模块；不新增通用插件路由或 DSH 适配。

#### Scenario: 相同网页服务两种产品
- **WHEN** 用户独立打开 Harness 或在 Development 使用内嵌/专注模式
- **THEN** 页面 MUST 复用同一完整对话实现，Development 不实现第二套对话控制

#### Scenario: 工程上下文交接
- **WHEN** Development 选择工作空间并新建对话
- **THEN** Development MUST 提供准确工作范围，Harness 自己创建对话并拥有执行交互；选择不自动发送模型消息

#### Scenario: 页面通信校验
- **WHEN** 页面接收非准确父/子窗口、错误 origin 或未知协议消息
- **THEN** 接收方 MUST 忽略消息，不改变选择或触发执行

#### Scenario: 显式工程操作只由 Harness 提交
- **WHEN** 用户在 Development 发起已授权的工程上下文交接
- **THEN** Development MUST 用准确请求身份交给 Harness 处理，Harness 自己维护首次提交及恢复；响应未知不得自动重发

#### Scenario: 工程业务独立工作
- **WHEN** 工程页面未装配 Harness 网页
- **THEN** 任务、知识和代码事实 MUST 可独立读取，不隐式创建执行

#### Scenario: 真实工程区域挂入外壳
- **WHEN** Development 装配入口提供现有工程页面和完整对话组件
- **THEN** Harness 通用外壳 MUST 承载双方，工程区域开合不卸载对话，工程页面不能包含第二个对话实例
- **AND** 同页工程导航 MUST 展开工程区域，但不得改变已有对话的准确执行范围

#### Scenario: 工程抽屉随所属区域隐藏
- **WHEN** 用户切换离开保留的工程页面，或收起其工作环境
- **THEN** 该区域打开的工程编辑抽屉 MUST 同步隐藏，不遮挡当前区域；重新展开后 MUST 恢复未保存草稿而不写入业务数据

#### Scenario: 同页工程上下文与链接
- **WHEN** 用户在完整对话内查看任务关联或点击文件、工程对象链接
- **THEN** 对话 MUST 分别通过明确文件能力或工作对象接口请求打开；当前 Development 装配 MUST 核验准确工程来源，工程控件 MUST 在可选上下文插槽中渲染，不使用窗口消息执行同页工程动作

#### Scenario: 同页装配与状态保全
- **WHEN** 用户切换工程路由、专注或分屏及环境开合
- **THEN** 同页完整对话 MUST 保持同一实例、执行身份、草稿及阅读位置，不重复发送或创建执行

#### Scenario: 工程上下文局部失败
- **WHEN** Development 提供的工程上下文组件渲染失败
- **THEN** 页面 MUST 在该插槽显示局部不可用提示，完整对话输入、观察及停止控件 MUST 保持同一实例且可用

#### Scenario: 收起态复用唯一导轨与分屏左右停靠
- **WHEN** Development 收起对话面板，或在分屏模式菜单切换“对话移到最左侧 / 对话移到右侧”
- **THEN** 页面 MUST 保留唯一的 Harness 导轨与宽度分隔条而不渲染宿主重复导轨或分隔条
- **AND** 收起态悬停“展开当前对话” MUST 展示暂看浮层（Peek），左/右停靠切换 MUST 真实移动整个分屏对话区到工程区域对应一侧并在刷新后保持
