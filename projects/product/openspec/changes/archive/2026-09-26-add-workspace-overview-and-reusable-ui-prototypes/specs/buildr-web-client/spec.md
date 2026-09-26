## MODIFIED Requirements

### Requirement: Buildr Web Task 详情必须提供 UI Prototype 视图
Buildr Web MUST 在任务（Task）方案设计的现有左侧菜单直接列出可发现的关键原型页面，按需读取同一任务关联变更（Change）的成果，MUST 不在主阅读区再重复放置页面列表。原型画面 MUST 可操作并自动适应可用宽度；“功能说明” MUST 使用与实施清单一致的临时查看、关闭、键盘退出和空间充足时固定并排机制，任务内默认收起。系统 MUST 提供“单独查看”并在新的浏览器页签中展示同一任务限定的页面列表、原型画面和说明，宽度足够时说明默认固定；MUST 不提供重复的扩大阅读和手动缩放控件。

#### Scenario: Task 存在多个原型页面
- **WHEN** 任务包含多个关键原型页面
- **THEN** 左侧菜单 MUST 直接允许选择，当前画面与说明 MUST 一致，来源及相对路径 MUST 可查看
- **AND** 页面切换 MUST 保留说明的固定选择，刷新后已选页面消失 MUST 给出提示并选择仍可用内容

#### Scenario: Task 没有可发现原型
- **WHEN** 任务没有关联变更、没有带标记的 HTML 或部分内容不可读取
- **THEN** 系统 MUST 表达必要空态或局部诊断，MUST NOT 改变任务状态或隐藏其他任务材料

#### Scenario: 用新窗口打开当前原型页面
- **WHEN** 用户激活“单独查看”
- **THEN** 系统 MUST 打开受信任的独立阅读页，保留当前任务限定与有效页面及状态选择，MUST 展示页面列表、画面和说明并支持切换
- **AND** 页面内模拟更改 MUST 不被当成跨页签共享事实

#### Scenario: 临时查看和固定说明
- **WHEN** 用户悬停或点击说明入口，或固定、关闭说明
- **THEN** 系统 MUST 沿用实施清单的阅读行为，固定说明 MUST 在页面切换时保持；窄空间 MUST 使用可关闭的浮层
- **AND** 同一阅读区域 MUST 不叠加实施清单与功能说明面板


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
- **WHEN** 用户从原型舞台打开独立阅读页或直接访问裸内容 URL
- **THEN** 独立阅读页 MUST 在隔离框架中加载同一 Task-scoped 内容响应；直接访问裸内容 MUST 继续施加内容响应隔离
- **AND** 原型内容文档 MUST 继续处于 opaque origin，不能读取 Buildr session 或父页面 DOM

## ADDED Requirements

### Requirement: 原型页面说明使用有界的兼容内容协议
系统 MUST 从已发现 HTML 内的可选版本化非执行数据读取关键页面、状态和纯文本说明，不新增任务记录字段、独立登记库或任意路径读取。系统 MUST 限制数据大小及结构并安全渲染；旧文件缺少元信息时 MUST 仍以标题作为单页阅读，格式错误 MUST 只产生局部诊断，不执行元信息或将 HTML 注入宿主。

#### Scenario: 旧成果兼容
- **WHEN** 已发现 HTML 只有现有标记与标题
- **THEN** 系统 MUST 继续提供隔离展示和独立阅读，说明缺失 MUST 不阻断其他页面

#### Scenario: 不可信说明和旧页面消息
- **WHEN** 元信息包含非法标识、执行内容或超限结构，或非当前框架、旧加载代次发送状态消息
- **THEN** 系统 MUST 拒绝无效内容或消息，并保持有效页面可用，MUST NOT 执行真实写入或扩大读取范围

### Requirement: 原型交互消息只控制当前阅读
原型与宿主之间的消息 MUST 只支持当前已发现页面、状态和位置提示，MUST 校验当前框架来源、加载代次及允许标识集合，MUST NOT 将不透明来源的 `null` 当作唯一信任凭据。消息 MUST NOT 发起真实接口（API）调用、任意导航或文件读取。

#### Scenario: 合法状态切换
- **WHEN** 当前隔离页面发出已声明的有效状态变化
- **THEN** 宿主 MUST 更新对应阅读说明并保持原有任务限定，不改变正式业务状态

### Requirement: 功能说明表达当前任务在原型中的预期结果
功能说明 MUST 综合提案与设计，只解释当前原型中与本次任务有关的功能、交互及结果，MUST NOT 要求所有提案需求或实现设计对应原型，也 MUST NOT 将原型制作过程作为功能说明。

#### Scenario: 阅读功能并定位对应区域
- **WHEN** 用户悬停或键盘聚焦带有位置的功能卡片
- **THEN** 系统 MUST 高亮当前画面的对应区域，移开或失焦后清除；点击可定位到该区域
- **AND** 高亮 MUST 不改变页面、状态或正在体验的模拟数据，不绘制说明连线
- **AND** 没有位置的旧说明 MUST 仍可阅读

#### Scenario: 原型内部改变当前画面
- **WHEN** 原型内的操作切换画面或关闭最后一个对象详情
- **THEN** 页面目录和功能说明 MUST 对齐实际呈现的画面，并清除上一画面的高亮

#### Scenario: 后续原型复用功能说明能力
- **WHEN** 智能体使用已获授权的原型技能生成后续原型
- **THEN** 技能 MUST 提供可复用的功能卡片、配套样式和区域联动组件及接入示例
- **AND** 本次阅读器与原型 MUST 使用同一组件来源，生成产物时内联资源，不依赖远程服务
