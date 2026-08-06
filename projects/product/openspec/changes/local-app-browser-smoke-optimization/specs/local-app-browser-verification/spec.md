## ADDED Requirements

### Requirement: Browser affected verification MUST use changed-path selector dispatch
Buildr Product MUST provide a single affected Browser entry that maps changed Product paths to the minimum sufficient Browser selector set, MUST explain each selected selector, and MUST execute the selected set without implicitly expanding to all unrelated resource flows.

#### Scenario: HTTP-only Local App change
- **WHEN** changed paths only affect Local App HTTP handlers, response mapping, API parameters, session, revision, or read/write error behavior
- **THEN** affected verification MUST select the corresponding HTTP/System owner
- **AND** MUST NOT start Chrome solely because the path is under `src/interfaces/local-app/`

#### Scenario: Page or router change
- **WHEN** changed paths affect page rendering, router targets, DOM bindings, visible state, or browser error handling
- **THEN** affected verification MUST select the corresponding Browser selector and its real dependencies
- **AND** MUST report the path-to-selector reason in the verification plan

#### Scenario: Multiple Browser selectors are selected
- **WHEN** changed paths affect more than one Browser resource flow
- **THEN** the dispatcher MUST run the selected selector set through one bounded Browser execution plan
- **AND** MUST preserve selector-level names, failure diagnostics, and cleanup evidence

## MODIFIED Requirements

### Requirement: 浏览器冒烟验证必须覆盖三个资源管理主流程
Buildr Product MUST 将本机应用浏览器验证作为 integration 测试，并 MUST 提供一个低成本核心流程以及 Project、Service、Change、Task 与 Articles 的稳定、可独立选择的流程；共享 fixture MAY 复用，但任一局部改动 MUST NOT 因单体测试结构被迫执行无关资源流程。

#### Scenario: 验证 Project 流程
- **WHEN** changed planner 识别 Project 列表、详情、保存或相关用户操作受到影响
- **THEN** 验证 MUST 只选择 Project browser integration 及其真实依赖
- **AND** MUST NOT 因此自动执行 Service、Change、Articles 或无关 Task browser integration

#### Scenario: 验证 Service 流程
- **WHEN** changed planner 识别 Service 过滤、详情、保存或相关用户操作受到影响
- **THEN** 验证 MUST 只选择 Service browser integration 及其真实依赖
- **AND** MUST NOT 因此自动执行 Project、Change、Articles 或无关 Task browser integration

#### Scenario: 验证 Change 流程
- **WHEN** changed planner 识别 Change 过滤、详情或 Agent Action 用户路径受到影响
- **THEN** 验证 MUST 只选择 Change browser integration 及其真实依赖
- **AND** MUST 继续证明 Agent Action 只生成 prompt、不直接修改 Change 文件

#### Scenario: 验证 Task 流程
- **WHEN** changed planner 识别 Task 路由、Tab、研发状态、交付状态或 Task Action 用户路径受到影响
- **THEN** 验证 MUST 只选择 Task browser integration 及其真实依赖
- **AND** MUST 继续覆盖该流程声明的 currentness、terminal delivery 与安全行为

#### Scenario: 验证 Articles 流程
- **WHEN** changed planner 识别 Articles 列表、详情、原文或资源图片用户路径受到影响
- **THEN** 验证 MUST 只选择 Articles browser integration 及其真实依赖
- **AND** MUST NOT 因此自动执行 Project、Service、Change 或无关 Task browser integration

#### Scenario: 验证 Shell 与核心流程
- **WHEN** app bootstrap、router、公共导航或全局浏览器错误处理受到影响
- **THEN** 验证 MUST 选择 Shell browser integration 与低成本核心流程
- **AND** 只有具体资源流程也受到影响时才 MUST 组合对应 Project、Service、Change、Task 或 Articles browser integration

### Requirement: 浏览器冒烟能力必须提供可诊断结果并渐进成熟
Buildr Product MUST 使用机器已有 Chrome/Chromium、随机 loopback 端口和独立临时 Workspace 执行 browser integration，并 MUST 为 affected 核心/专项入口与显式 full 入口记录独立选择原因、阶段耗时和失败诊断；Browser capability 的 maturity 或 enforcement MUST 由验证结果和项目 owner 决定，不得因优化实现自动改变。

#### Scenario: 浏览器环境可用
- **WHEN** 环境具备 Node、npm 和受支持的 Chrome/Chromium 可执行文件
- **THEN** 验证 MUST 自动创建隔离 fixture、收集 `pageerror` 与 `console.error`、关闭浏览器和服务器并清理测试拥有的临时目录
- **AND** affected 执行 MUST 只运行 dispatcher 选择的核心/专项 selector

#### Scenario: 浏览器环境不可用
- **WHEN** 无法解析或启动受支持的浏览器
- **THEN** 验证 MUST 明确失败或由编排标记为环境阻塞
- **AND** MUST NOT 下载浏览器、访问外部系统或回退操作真实 Workspace

#### Scenario: 显式 full Browser 回归
- **WHEN** 维护者明确选择 full/Candidate Browser 回归
- **THEN** `test:browser:smoke` MUST 保留运行完整 selector 集合的入口
- **AND** full 回归 MUST 与 affected dispatcher 的最小选择结果分开报告

### Requirement: Browser 与低层 integration 必须保持职责互补
Buildr Product MUST 由快速检查或 HTTP/System integration 持有 API 参数、状态、session、revision、路径、错误和 Local App HTTP 生命周期事实，并 MUST 由 browser integration 持有用户可见接线、路由、DOM 交互与浏览器运行错误；同一行为没有不同边界价值时 MUST NOT 通过读取前端实现源码文本重复断言。

#### Scenario: 只修改底层 API 行为
- **WHEN** 改动只影响已有低层 owner 覆盖的 API handler、参数或响应映射，且用户可见接线不变
- **THEN** changed planner MUST 选择对应快速检查或 HTTP/System integration
- **AND** MUST NOT 仅因文件位于 local-app 子树而自动选择整页 browser integration

#### Scenario: 修改用户可见接线
- **WHEN** 改动影响按钮绑定、路由目标、DOM 状态或用户操作结果
- **THEN** changed planner MUST 选择对应资源 browser integration
- **AND** browser MUST 使用真实交互和可见结果断言，不得以实现源码包含特定函数调用文本作为替代

#### Scenario: Local App HTTP owner 独立定位
- **WHEN** Local App HTTP 改动需要真实 server、filesystem 或 SQLite 边界验证
- **THEN** verification registry MUST provide a narrow System owner with an independent test file or test slice
- **AND** the broad Workspace lifecycle System step MUST NOT be selected solely by that HTTP owner input
