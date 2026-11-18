## MODIFIED Requirements

### Requirement: Harness 必须提供完整唯一网页并由 Development 嵌入

系统 MUST 将对话导航、历史、消息、工具展示、输入、附件、发送、模型与账号设置、问题、审批、停止、接续和恢复全部实现在 buildr-harness-web。独立 buildr-harness-ui 包 MUST 删除；Development MUST NOT 导入或重组 Harness 对话 React 组件及执行状态容器，但 MUST 允许通过公开通用外壳入口组合完整对话网页和 Development 工程区域。

Development 的 harness-ui 模块 MUST 只准备工程现场、选择工作空间、嵌入网页、维护任务关联和工程导航；任务选择控件 MUST 留在 Development 页面区域。Harness MUST 不管理工程任务状态。

#### Scenario: 相同网页服务两种产品
- **WHEN** 用户独立打开 Harness 或在 Development 使用内嵌/专注模式
- **THEN** 页面 MUST 消费同一完整网页产物，Development 不实现第二套对话控制

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
- **WHEN** Development 装配入口提供现有工程页面和完整对话网页
- **THEN** Harness 通用外壳 MUST 承载双方，工程区域开合不卸载对话，工程页面不能包含第二个对话实例
- **AND** 同页工程导航 MUST 展开工程区域，但不得改变已有对话的准确执行范围

#### Scenario: 工程抽屉随所属区域隐藏
- **WHEN** 用户切换离开保留的工程页面，或收起其工作环境
- **THEN** 该区域打开的工程编辑抽屉 MUST 同步隐藏，不遮挡当前区域；重新展开后 MUST 恢复未保存草稿而不写入业务数据

### Requirement: Development 必须保留对话模块展开偏好
Development 与嵌套的 Harness 网页 MUST 在同浏览器配置域内记住用户明确选择的展开或收起状态、专注或分屏模式以及专注模式下的对话列表展开状态，刷新时稳定恢复，不得因可驱逐工作缓存占用浏览器存储配额或嵌入式 iframe 初始化握手顺序而退回默认状态；无偏好时根入口 MUST 展示专注对话，工程直达路径 MUST 完整展示工程区域并保留收起的对话入口。显式工程目录入口 `/?catalog=1` MUST 显示目录，不得被专注偏好遮挡。普通分屏模式刷新时仍保持分屏对话视图；收起面板或退出专注模式 MUST 同步清理专注与对话列表展开偏好。嵌入式页面再次加载时，宿主 MUST 重新下发当前模式与列表视图配置，在内层确认首次配置前不得以默认对话视图覆盖已恢复的列表视图；切换专注或分屏模式事件 SHOULD 携带明确目标状态。写入浏览器持久化存储遇到配额异常时，MUST 允许按需清理可重建的源码控件缓存后重试，并结合同标签页会话存储兜底；浏览器存储完全不可用 MUST NOT 阻止当前操作；恢复 MUST NOT 发送消息。

#### Scenario: 刷新恢复展开
- **WHEN** 用户处于展开的分屏对话模式或收起状态并刷新页面（包括存在缓存占用浏览器存储配额的场景）
- **THEN** 外层模块 MUST 稳定恢复展开与分屏模式或收起状态，不因刷新退回专注或丢失当前模式，原对话由 Harness 自身恢复

#### Scenario: 刷新恢复专注模式与对话列表
- **WHEN** 用户进入专注对话模式并切换对话列表展开状态后刷新页面（包括 `buildr:source-control-cache:*` 已占满 `localStorage` 或 iframe 重新加载的场景）
- **THEN** 页面 MUST 稳定保持在专注对话模式，桌面满足并排宽度时对话列表 MUST 保持刷新前的展开或收起状态，原对话选择与草稿保持不变，且不自动发送消息

#### Scenario: 首次使用根入口和工程深链
- **WHEN** 浏览器没有明确布局偏好并打开根路径或具体工程路径
- **THEN** 根路径 MUST 从完整对话开始，具体工程路径 MUST 显示对应工程页面；两者不自动创建执行或发送消息
