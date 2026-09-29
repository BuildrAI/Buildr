## MODIFIED Requirements

### Requirement: Buildr Web Task 详情必须提供 UI Prototype 视图
Buildr Web MUST 在任务（Task）方案设计的现有左侧菜单直接列出可发现的关键原型页面，按需读取同一任务关联变更（OpenSpec Change）和任务限定本机目录的成果；MUST NOT 因任务没有关联变更而跳过读取，MUST 不在主阅读区再重复放置页面列表。原型画面 MUST 可操作并自动适应可用宽度；“功能说明” MUST 使用与实施清单一致的临时查看、关闭、键盘退出和空间充足时固定并排机制，任务内默认收起。系统 MUST 提供“单独查看”并在新的浏览器页签中展示同一任务限定的页面列表、原型画面和说明，宽度足够时说明默认固定；MUST 不提供重复的扩大阅读和手动缩放控件。

#### Scenario: Task 存在多个原型页面
- **WHEN** 任务包含多个关键原型页面
- **THEN** 左侧菜单 MUST 直接允许选择，当前画面与说明 MUST 一致，来源及相对路径 MUST 可查看
- **AND** 页面切换 MUST 保留说明的固定选择，刷新后已选页面消失 MUST 给出提示并选择仍可用内容

#### Scenario: Task 没有可发现原型
- **WHEN** 任务关联变更及任务限定本机目录均没有带标记的可读 HTML，或部分内容不可读取
- **THEN** 系统 MUST 表达必要空态或局部诊断，MUST NOT 改变任务状态或隐藏其他任务材料

#### Scenario: 用新窗口打开当前原型页面
- **WHEN** 用户激活“单独查看”
- **THEN** 系统 MUST 打开受信任的独立阅读页，保留当前任务限定与有效页面及状态选择，MUST 展示页面列表、画面和说明并支持切换
- **AND** 页面内模拟更改 MUST 不被当成跨页签共享事实

#### Scenario: 临时查看和固定说明
- **WHEN** 用户悬停或点击说明入口，或固定、关闭说明
- **THEN** 系统 MUST 沿用实施清单的阅读行为，固定说明 MUST 在页面切换时保持；窄空间 MUST 使用可关闭的浮层
- **AND** 同一阅读区域 MUST 不叠加实施清单与功能说明面板

#### Scenario: 无变更任务查看本机原型
- **WHEN** 正式任务没有关联变更但主工作空间（Canonical Workspace）的任务限定目录有可读原型
- **THEN** 方案设计与单独查看 MUST 展示该原型，并将来源标识为任务原型，不伪造变更信息

### Requirement: UI Prototype API 必须保持 Task-scoped 只读边界
本机超文本传输协议（HTTP）入口 MUST 提供只读任务限定原型接口（Task-scoped UI Prototype API），先验证任务存在，再从任务记录（Task Record）的变更引用和受管工作树（Worktree）证据解析实际工作副本，并独立读取主工作空间（Canonical Workspace）的 `.buildr/local/task-prototypes/<task-id>/`。`/ui-prototypes` 列表响应 MUST 返回全部符合安全限制且带 `buildr:ui-prototype` 标记页面的不透明标识、标题、来源与相对路径；变更来源 MUST 保持原标识并提供项目、变更及生命周期（Lifecycle），任务本机来源 MUST 明确 `source: task` 且对应项目、变更及生命周期值为 `null`。具体 HTML MUST 只通过同一任务与已发现页面标识的专用响应读取。接口（API）MUST 忽略旧 `buildr:ui-preview` 标记、符号链接（Symbolic Link）、未标记或超出安全读取边界的文件，MUST NOT 接受文件系统路径、写入任务或变更，或提供任意文件 HTML 路由。一个来源不可读 MUST 仅形成局部诊断，保留其他安全来源。

#### Scenario: 读取候选工作副本的多个页面
- **WHEN** 任务的受管工作树（Worktree）证据指向含多个原型页面的可用候选变更
- **THEN** 接口（API）MUST 优先返回候选工作副本中的全部符合安全限制且带新标记页面
- **AND** MUST NOT 用保留副本覆盖候选内容

#### Scenario: Change 含有旧标记或其他 HTML
- **WHEN** 任务关联变更同时含有旧标记、未标记 HTML、符号链接（Symbolic Link）或超限文件
- **THEN** 接口（API）MUST 不返回这些文件内容
- **AND** 适用的跳过原因 MUST 以不泄露绝对路径的诊断表达

#### Scenario: 调用旧 Preview API
- **WHEN** 客户端请求旧 `/ui-previews` 列表或内容路由
- **THEN** 本机超文本传输协议（HTTP）入口 MUST NOT 将其作为原型接口（UI Prototype API）处理
- **AND** MUST NOT 提供兼容重定向或别名

#### Scenario: 本机原型与失效变更并存
- **WHEN** 当前任务的本机原型可读，但某条关联变更的项目已失效或来源不可读
- **THEN** 列表与单页接口（API）MUST 仍能读取本机原型，并返回该变更的局部诊断

#### Scenario: 请求其他任务或伪造页面标识
- **WHEN** 任务不存在，或页面标识不在该任务当前可发现范围内
- **THEN** 接口（API）MUST 拒绝读取，不因其他任务拥有相同文件名而放行
