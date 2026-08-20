## ADDED Requirements

### Requirement: Buildr Web Task 详情必须提供 UI Prototype 视图
Buildr Web Task 详情 MUST 提供独立“原型”一级视图，按需读取当前 Task 关联 Change 中可发现的一个或多个 UI Prototype 页面，并 MUST 允许用户在页面列表中选择和操作当前页面。页面 MUST 同时说明 UI Prototype 是实现参考而非正式设计、canonical spec 或像素级验收标准。当当前页面可在舞台中展示时，原型舞台 MUST 提供「新窗口打开」控件，并用新窗口打开该页面同一 Task-scoped 内容 URL。

#### Scenario: Task 存在多个原型页面
- **WHEN** 只读 API 返回两个或以上 UI Prototype 页面
- **THEN** 原型视图 MUST 展示全部页面的标题、关联 Change 与 portable 相对路径
- **AND** 用户选择任一页面后 MUST 在同一 Task 详情中看到对应完整可交互页面

#### Scenario: Task 没有可发现原型
- **WHEN** Task 没有关联 Change、Change 暂不可用或关联 Change 中没有带新标记的 HTML
- **THEN** 原型视图 MUST 展示明确空态或诊断
- **AND** MUST NOT 改变 Task 状态或隐藏其他详情视图

#### Scenario: 用新窗口打开当前原型页面
- **WHEN** 原型舞台正在展示当前选中页面
- **THEN** 舞台 MUST 提供「新窗口打开」控件
- **AND** 激活后 MUST 用新窗口打开 iframe 正在使用的同一 Task-scoped 内容 URL
- **AND** MUST NOT 把原型 HTML 注入 Buildr Web 父页面 DOM

### Requirement: UI Prototype API 必须保持 Task-scoped 只读边界
本机 HTTP interface MUST 提供只读 Task-scoped UI Prototype API，从 Task Record 的 Change 引用和 saved Environment current 解析 working Change。`/ui-prototypes` 列表响应 MUST 返回全部带 `buildr:ui-prototype` 标记页面的不透明 ID、标题、lifecycle 与 portable 相对路径；具体 HTML MUST 只通过同一 Task 与已发现页面 ID 的专用响应读取。API MUST 忽略旧 `buildr:ui-preview` 标记、符号链接、未标记或超出安全读取边界的文件，MUST NOT 接受 filesystem path、写入 Task/Change 或提供任意文件 HTML 路由。

#### Scenario: 读取候选工作副本的多个页面
- **WHEN** active Task 的 saved Environment current 指向含多个原型页面的可用候选 Change
- **THEN** API MUST 优先返回候选 working copy 中的全部带新标记页面
- **AND** MUST NOT 用 retained baseline 覆盖候选内容

#### Scenario: Change 含有旧标记或其他 HTML
- **WHEN** Task 关联 Change 同时含有旧标记、未标记 HTML、符号链接或超限文件
- **THEN** API MUST 不返回这些文件内容
- **AND** 适用的跳过原因 MUST 以不泄露绝对路径的诊断表达

#### Scenario: 调用旧 Preview API
- **WHEN** 客户端请求旧 `/ui-previews` 列表或内容 route
- **THEN** 本机 HTTP interface MUST NOT 将其作为 UI Prototype API 处理
- **AND** MUST NOT 提供兼容重定向或别名

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
- **WHEN** 用户从原型舞台用新窗口打开当前页面的内容 URL
- **THEN** 新窗口 MUST 加载同一 Task-scoped 内容响应
- **AND** 该文档 MUST 继续处于 opaque origin，不能读取 Buildr session 或父页面 DOM

## REMOVED Requirements

### Requirement: Buildr Web Task 详情必须提供 UI Preview 视图
**Reason**: Task 详情入口非兼容地替换为支持多个页面的 UI Prototype 视图。

**Migration**: 使用“原型”Tab 和 `/ui-prototypes` read path；不保留“预演”入口。

#### Scenario: 旧预演入口被移除
- **WHEN** 用户打开本 Change 后的 Task 详情
- **THEN** 页面 MUST NOT 再提供“预演”一级视图

### Requirement: UI Preview API 必须保持 Task-scoped 只读边界
**Reason**: 旧 Preview API 与发现标记被新的 Prototype API 取代。

**Migration**: 使用 `/ui-prototypes` 与 `buildr:ui-prototype`；旧 route 和 marker 不兼容。

#### Scenario: 旧 Preview API 不兼容
- **WHEN** 客户端请求旧 `/ui-previews` route
- **THEN** 本机 HTTP interface MUST NOT 将其作为原型 API 处理

### Requirement: Buildr Web 必须隔离 UI Preview 可执行内容
**Reason**: 隔离执行边界转移到 UI Prototype 页面。

**Migration**: 使用 UI Prototype 内容 route；opaque-origin sandbox 与离线 CSP 继续保持。

#### Scenario: 旧 Preview 内容入口不再使用
- **WHEN** Buildr Web 展示本 Change 后的原型页面
- **THEN** 客户端 MUST NOT 使用旧 UI Preview 内容 route
