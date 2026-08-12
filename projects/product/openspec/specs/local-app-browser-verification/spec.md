# local-app-browser-verification Specification

## Purpose

定义 Buildr 本机应用轻量浏览器冒烟验证的隔离边界、项目/服务/变更主流程覆盖、错误诊断和渐进式测试声明要求。
## Requirements

### Requirement: Buildr 必须提供隔离的本机应用浏览器冒烟验证
Buildr Product MUST 提供可重复执行的真实浏览器验证，并 MUST 在独立临时 Workspace 和随机 loopback 端口中运行，不读取或修改开发者真实 Workspace。

#### Scenario: 执行浏览器冒烟验证
- **WHEN** 环境具备 Node、npm 和受支持的 Chrome/Chromium 可执行文件
- **THEN** 验证 MUST 自动创建临时 Workspace fixture、启动本机应用并驱动无头浏览器
- **AND** 执行结束后 MUST 关闭浏览器与服务器并清理测试拥有的临时目录

#### Scenario: 浏览器环境不可用
- **WHEN** 无法解析或启动受支持的浏览器
- **THEN** 验证 MUST 以明确诊断失败或由测试编排标记为环境阻塞
- **AND** MUST NOT 下载浏览器、访问外部系统或回退操作真实 Workspace

### Requirement: 浏览器冒烟验证必须覆盖三个资源管理主流程
Buildr Product MUST 将本机应用浏览器验证作为 integration 测试，并 MUST 提供 Project、Service、Change 与 Shell 四个稳定、可独立选择的流程；共享 fixture MAY 复用，但任一局部改动 MUST NOT 因单体测试结构被迫执行无关资源流程。

#### Scenario: 验证 Project 流程
- **WHEN** changed planner 识别 Project 列表、详情、保存或相关用户操作受到影响
- **THEN** 验证 MUST 只选择 Project browser integration 及其真实依赖
- **AND** MUST NOT 因此自动执行 Service 或 Change browser integration

#### Scenario: 验证 Service 流程
- **WHEN** changed planner 识别 Service 过滤、详情、保存或相关用户操作受到影响
- **THEN** 验证 MUST 只选择 Service browser integration 及其真实依赖
- **AND** MUST NOT 因此自动执行 Project 或 Change browser integration

#### Scenario: 验证 Change 流程
- **WHEN** changed planner 识别 Change 过滤、详情或 Agent Action 用户路径受到影响
- **THEN** 验证 MUST 只选择 Change browser integration 及其真实依赖
- **AND** MUST 继续证明 Agent Action 只生成 prompt、不直接修改 Change 文件

#### Scenario: 验证 Shell 流程
- **WHEN** app bootstrap、router、公共导航或全局浏览器错误处理受到影响
- **THEN** 验证 MUST 选择 Shell browser integration
- **AND** 只有具体资源流程也受到影响时才 MUST 组合对应 Project、Service 或 Change browser integration

### Requirement: 浏览器冒烟能力必须提供可诊断结果并渐进成熟
Buildr Product MUST 使用机器已有 Chrome/Chromium、随机 loopback 端口和独立临时 Workspace 执行 browser integration，并 MUST 在环境与稳定性未确认前保持非阻断成熟度；本次执行能力拆分 MUST NOT 自动修改 Project `verification.yml` 的 maturity 或 enforcement。

#### Scenario: 浏览器环境可用
- **WHEN** 环境具备 Node、npm 和受支持的 Chrome/Chromium 可执行文件
- **THEN** 验证 MUST 自动创建隔离 fixture、收集 `pageerror` 与 `console.error`、关闭浏览器和服务器并清理测试拥有的临时目录

#### Scenario: 浏览器环境不可用
- **WHEN** 无法解析或启动受支持的浏览器
- **THEN** 验证 MUST 明确失败或由编排标记为环境阻塞
- **AND** MUST NOT 下载浏览器、访问外部系统或回退操作真实 Workspace

#### Scenario: 暂不更新测试声明
- **WHEN** 本 change 交付 browser selector、registry step 和测试实现
- **THEN** `projects/product/verification.yml` MUST 保持内容不变
- **AND** browser capability 的声明拆分、成熟度或门禁调整 MUST 等待后续团队确认

### Requirement: Browser 与低层 integration 必须保持职责互补
Buildr Product MUST 由快速检查或 HTTP integration 持有 API 参数、状态、session、revision、路径和错误分支，并 MUST 由 browser integration 持有用户可见接线、路由、DOM 交互与浏览器运行错误；同一行为没有不同边界价值时 MUST NOT 通过读取前端实现源码文本重复断言。

#### Scenario: 只修改底层 API 行为
- **WHEN** 改动只影响已有低层 owner 覆盖的 API handler、参数或响应映射，且用户可见接线不变
- **THEN** changed planner MUST 选择对应快速检查或 HTTP integration
- **AND** MUST NOT 仅因文件位于 local-app 子树而自动选择整页 browser integration

#### Scenario: 修改用户可见接线
- **WHEN** 改动影响按钮绑定、路由目标、DOM 状态或用户操作结果
- **THEN** changed planner MUST 选择对应资源 browser integration
- **AND** browser MUST 使用真实交互和可见结果断言，不得以实现源码包含特定函数调用文本作为替代

### Requirement: Task Browser Smoke 必须区分 active currentness 与 terminal delivery
自动 Browser Smoke MUST 使用独立 fixture 覆盖 active unknown、active ready/current、真实 stale、completed delivered 与 completed unproven，并 MUST 对 terminal 研发/证据主文案、四页签、技术详情层级和安全 HTTP 行为形成可重复 assertion。手工浏览器检查 MUST NOT 被报告为自动 E2E。

#### Scenario: active unknown fixture
- **WHEN** active Task 的 Environment unavailable
- **THEN** Browser Smoke MUST 断言研发状态仍为 unknown 且不出现 delivered

#### Scenario: completed delivered fixture
- **WHEN** fixture 含 matching Task、Development handoff、Review/Verification Results 与成功 Finish completion
- **THEN** Browser Smoke MUST 断言“已交付”、交付时证据关联和 cleanup 正常文案
- **AND** MUST 断言页面未把历史实时轴显示为 current

#### Scenario: completed unproven fixture
- **WHEN** completed Task 缺少 matching successful Finish
- **THEN** Browser Smoke MUST 断言“交付未经证明”且不使用 delivered 样式

#### Scenario: 真实 stale fixture
- **WHEN** active Result target 与 current target identity 不一致
- **THEN** Browser Smoke MUST 断言真实 stale 文案，而不是 unknown 或 delivered

### Requirement: Browser 测试 DOM 钩子策略必须在 UI 重设计中显式遵守
Buildr Web UI 重设计 MUST 按经确认的钩子策略处理 browser smoke 使用的稳定 DOM id / `data-*` 选择器：若策略为保留，实现 MUST 尽量不破坏既有钩子；若策略为重写，同一 Change MUST 同步更新 `product/buildr` 的 browser smoke 选择器，并使受影响 selector 在生产托管路径下重新通过。未确认策略前，实现 MUST NOT 大规模删除或重命名既有测试钩子。

#### Scenario: 保留钩子策略
- **WHEN** Brief 确认“尽量保留现有测试钩子”
- **THEN** 重设计后的页面 MUST 继续暴露既有 smoke 所依赖的稳定钩子（例如工作空间网格、概览标题、任务详情与导航 `data-nav`）
- **AND** browser smoke MUST 在无需改写选择器语义的前提下仍可定位关键控件

#### Scenario: 重写钩子策略
- **WHEN** Brief 确认“允许重写钩子并同步改 browser 测试”
- **THEN** 前端钩子变更与 `test/browser-smoke` 选择器更新 MUST 同 Change 交付
- **AND** 更新后的 smoke MUST 仍在生产托管 dist 上证明功能覆盖，且 MUST NOT 降低可独立选择的 selector 边界

### Requirement: Browser smoke 必须验证生产托管的 Buildr Web 构建产物
Buildr Product browser smoke MUST 针对由 `buildr web`（或测试夹具中的等价 Buildr Web HTTP server）生产托管的 Buildr Web 构建产物执行，MUST NOT 将 Vite 开发服务器或 HMR 会话当作 delivery-required browser 完成证据。UI 视觉/布局重设计不得取消既有可独立选择的 shell、project、service、task、articles（及仍声明的 change）browser selector；受影响切片 MUST 仍可按 changed planner 独立选择。

#### Scenario: Smoke uses production static hosting
- **WHEN** `product.browser-smoke` or a browser selector runs during Candidate or delivery verification
- **THEN** the harness MUST start Buildr Web HTTP hosting of the built web dist on an isolated loopback port
- **AND** MUST NOT require a concurrent Vite dev server for the assertions to pass

#### Scenario: Selectors remain independently choosable after React migration
- **WHEN** only Buildr Web shell or page visual/layout wiring changes
- **THEN** changed planner MUST be able to select the affected browser integration without forcing unrelated resource journeys
- **AND** Shell browser integration MUST remain available when bootstrap、router or global navigation presentation changes

#### Scenario: Functional coverage checklist remains enforceable
- **WHEN** UI redesign claims visual completion within the confirmed scope
- **THEN** browser verification MUST still cover workspace shell navigation、Project/Service metadata flows、articles、Task list/detail terminal states and Agent Action prompt-only behavior as declared by existing browser smoke scenarios
- **AND** MUST NOT replace those assertions with source-text scans of React components or Vite HMR-only checks
