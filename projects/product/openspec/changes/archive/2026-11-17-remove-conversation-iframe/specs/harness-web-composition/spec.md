## RENAMED Requirements

- FROM: `### Requirement: Harness 必须提供完整唯一网页并由 Development 嵌入`
- TO: `### Requirement: Harness 必须提供完整唯一对话并支持公开同页装配`

## MODIFIED Requirements

### Requirement: Harness 必须提供完整唯一对话并支持公开同页装配

系统 MUST 将对话导航、历史、消息、工具展示、输入、附件、发送、模型与账号设置、问题、审批、停止、接续和恢复全部实现在 buildr-harness-web。独立 buildr-harness-ui 包 MUST 删除；Development MUST 通过公开完整对话组件入口装配，MUST NOT 导入内部组件重组对话或执行状态容器。第一方组合 MUST 使用同一 React 页面树，不加载对话 iframe；独立完整网页入口 MUST 继续可用。

Development 的 harness-ui 模块 MUST 只准备工程现场、选择工作空间、挂载完整对话、维护任务关联和工程导航；任务选择控件 MUST 由 Development 提供并通过语义上下文插槽原位呈现，MUST NOT 依赖跨窗口坐标覆盖。Harness MUST 不管理工程任务状态。

上下文插槽 MUST 是可选工作上下文区域，而非工程任务专属空位；未提供内容时 MUST NOT 保留固定任务占位。文件能力与工作对象打开 MUST 由产品装配显式接入，Harness MUST NOT 将通用打开入口写死为 Development。当前组合继续使用 Development 已有文件浏览器，不迁移文件能力、不新增通用插件路由或 DSH 适配。

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
