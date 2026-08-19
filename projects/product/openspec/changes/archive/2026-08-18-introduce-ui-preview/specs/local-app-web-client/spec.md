## ADDED Requirements

### Requirement: Buildr Web Task 详情必须提供 UI Preview 视图
Buildr Web Task 详情 MUST 提供独立“预演”一级视图，按需读取当前 Task 关联 Change 中可发现的 UI Preview 页面，并 MUST 允许用户在多个页面之间选择和操作当前页面。页面 MUST 同时说明 UI Preview 是方案参考而非正式设计、生产原型或像素级验收标准。

#### Scenario: Task 存在多个预演页面
- **WHEN** 只读 API 返回两个或以上 UI Preview 页面
- **THEN** 预演视图 MUST 展示每个页面的标题、关联 Change 与 portable 相对路径
- **AND** 用户选择页面后 MUST 在同一 Task 详情中看到完整可交互页面

#### Scenario: Task 没有可发现预演稿
- **WHEN** Task 没有关联 Change、Change 暂不可用或关联 Change 中没有带标记 HTML
- **THEN** 预演视图 MUST 展示明确空态或诊断
- **AND** MUST NOT 改变 Task 状态或隐藏其他详情视图

### Requirement: UI Preview API 必须保持 Task-scoped 只读边界
本机 HTTP interface MUST 提供只读 Task-scoped UI Preview API，从 Task Record 的 Change 引用和 saved Environment current 解析 working Change。列表响应 MUST 只返回带 UI Preview 标记页面的不透明 ID、标题、lifecycle 与 portable 相对路径；具体 HTML MUST 只通过同一 Task 与已发现页面 ID 的专用响应读取。API MUST 忽略符号链接、未标记或超出安全读取边界的文件，MUST NOT 接受 filesystem path、写入 Task/Change 或提供任意文件 HTML 路由。

#### Scenario: 读取候选工作副本
- **WHEN** active Task 的 saved Environment current 指向可用候选 Change
- **THEN** API MUST 优先返回候选 working copy 中的带标记预演文件
- **AND** MUST NOT 用 retained baseline 覆盖候选内容

#### Scenario: Change 含有其他 HTML
- **WHEN** Task 关联 Change 同时含有未标记 HTML、符号链接或超限文件
- **THEN** API MUST 不返回这些文件内容
- **AND** 适用的跳过原因 MUST 以不泄露绝对路径的诊断表达

### Requirement: Buildr Web 必须隔离 UI Preview 可执行内容
Buildr Web MUST 在不含 `allow-same-origin` 的 sandbox iframe 中运行 UI Preview，仅允许页面自身 JavaScript 交互。页面内容响应 MUST 以 HTTP CSP 同时施加 `sandbox allow-scripts` 与离线资源策略，禁止网络连接、外部脚本/样式/字体、父页面访问与 Buildr session/API 权限；直接打开内容响应时 MUST 继续处于 opaque origin。客户端 MUST NOT 使用 `dangerouslySetInnerHTML` 或继承主页面脚本限制的 `srcdoc` 把预演内容注入 Buildr Web DOM。

#### Scenario: 预演稿包含交互脚本
- **WHEN** UI Preview HTML 使用内联 JavaScript 切换关键状态
- **THEN** iframe MUST 允许该页面内部交互正常运行
- **AND** 脚本 MUST 处于 opaque origin，不能读取父页面 DOM 或 Buildr session

#### Scenario: 预演稿引用远程资源
- **WHEN** HTML 尝试加载远程脚本、样式、字体、图像或发起网络请求
- **THEN** preview document CSP MUST 阻止该请求
- **AND** Buildr Web 主页面 MUST 保持可用
