## MODIFIED Requirements

### Requirement: Buildr Web Task 详情必须提供 UI Preview 视图
Buildr Web Task 详情 MUST 提供独立“预演”一级视图，按需读取当前 Task 关联 Change 中可发现的 UI Preview 页面，并 MUST 允许用户在多个页面之间选择和操作当前页面。页面 MUST 同时说明 UI Preview 是方案参考而非正式设计、生产原型或像素级验收标准。当当前页面可在舞台中展示时，预演舞台 MUST 提供「新窗口打开」控件，并用新窗口打开该页面同一 Task-scoped 内容 URL。

#### Scenario: Task 存在多个预演页面
- **WHEN** 只读 API 返回两个或以上 UI Preview 页面
- **THEN** 预演视图 MUST 展示每个页面的标题、关联 Change 与 portable 相对路径
- **AND** 用户选择页面后 MUST 在同一 Task 详情中看到完整可交互页面

#### Scenario: Task 没有可发现预演稿
- **WHEN** Task 没有关联 Change、Change 暂不可用或关联 Change 中没有带标记 HTML
- **THEN** 预演视图 MUST 展示明确空态或诊断
- **AND** MUST NOT 改变 Task 状态或隐藏其他详情视图

#### Scenario: 用新窗口打开当前预演页面
- **WHEN** 预演舞台正在展示当前选中页面
- **THEN** 舞台 MUST 提供「新窗口打开」控件，且 MUST NOT 再展示「隔离预览」状态文案
- **AND** 激活后 MUST 用新窗口打开 iframe 正在使用的同一 Task-scoped 内容 URL
- **AND** MUST NOT 把预演 HTML 注入 Buildr Web 父页面 DOM

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

#### Scenario: 新窗口直接打开当前预演页面
- **WHEN** 用户从预演舞台用新窗口打开当前页面的内容 URL
- **THEN** 新窗口 MUST 加载同一 Task-scoped 内容响应
- **AND** 该文档 MUST 继续处于 opaque origin，不能读取 Buildr session 或父页面 DOM
