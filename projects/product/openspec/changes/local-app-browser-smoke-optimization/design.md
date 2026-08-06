## Context

当前 `local-app-browser.test.mjs` 已支持 `shell`、`project`、`service`、`task`、`articles` selector，但默认 `test:browser:smoke` 仍在一个测试进程中执行全部流程。每次执行都会准备 Git/Workspace fixture、启动 Local App 与 preview server、启动 Chrome，并在单个 180 秒测试中串行完成多个用户旅程。

同时，`product.browser-smoke` capability 的路径范围覆盖整个 Local App 子树，`test:changed` 对 `src/interfaces/local-app/http/**` 还会选择宽泛的 `system` step。结果是 HTTP/API 改动可能同时承担 Unit、完整 System 与 Browser 成本，而 Browser 失败也难以定位到具体资源流程。

本 Change 只优化验证编排与测试实现，不改变 Local App HTTP、Web API、页面业务行为或用户可见契约。

## Goals / Non-Goals

**Goals:**

- 按 changed paths 选择最小充分的 Browser selector，并在一次 Browser 进程内复用必要的 fixture、server 和 Chrome。
- 保留核心用户交互、路由、DOM 可见结果和浏览器运行错误的真实证据。
- 让 HTTP/API 与 Workspace/System 测试持有参数、状态、session、revision、错误和生命周期事实，避免 Browser 重复验证。
- 将 Local App HTTP 改动从宽泛 System 集合中拆出可独立定位的测试入口。
- 为 affected、显式 Browser 回归和 Candidate/full 验证保留清晰、可诊断的入口与耗时预算。

**Non-Goals:**

- 不改变 Local App 运行时、HTTP response schema、页面业务逻辑或权限边界。
- 不引入第二套 Playwright/Cypress/browser runner，不下载浏览器，不并行启动多个真实 Chrome。
- 不删除 Project、Service、Change、Task 或 Articles 的现有专项覆盖；它们只从默认 affected 路径中按需选择。
- 不把 Browser Smoke 改造成性能压测，也不以降低断言数量换取表面耗时下降。

## Decisions

### 1. 用统一 changed selector dispatcher 复用现有 selector

新增 `test:browser:changed` 薄入口，读取验证编排提供的 changed paths，将路径映射到 `shell`、`project`、`service`、`task`、`articles` 等 selector，并以 selector 集合启动一次 Browser 测试。现有 `test:browser:smoke` 继续作为显式 full Browser 回归入口，现有单 selector scripts 继续支持故障定位。

选择按路径选择而不是把默认入口改成固定单一 smoke，是因为局部 UI 变化仍需要保留对应资源流程；选择一次进程执行 selector 集合而不是并行多个 Chrome，是因为 Browser resource capacity 为 1，且共享 fixture/浏览器更容易稳定清理。

### 2. 收窄 Browser capability，保留 HTTP/System primary owner

Browser capability 的 affected applicability 只覆盖页面、router、DOM 接线、浏览器运行错误和对应 Browser test；纯 `src/interfaces/local-app/http/**` 的参数、状态、错误与只读边界由 HTTP/System owner 证明。为 Local App HTTP 增加窄的 `node-test` System step，并从 broad `system` step 的输入中排除仅由该窄 owner 覆盖的 HTTP 路径。

这样不会把 HTTP 改动从验证中删除，而是把它从“完整 Workspace lifecycle + Chrome”改成最低充分的真实 server/HTTP 证据。

### 3. Fixture 按 selector profile 最小化

Browser fixture 按选中的 selector 准备最小 Workspace、Project、Service、Change、Task 和 publication 数据。仅当被测事实是公共 CLI/Git lifecycle 时才通过 CLI/Git 建立对应状态；普通页面展示状态使用现有 runtime/fixture helper 直接写入隔离临时 Workspace。每次 selector 集合只创建一次 clean controller、Local App server、preview server、Browser context，并统一清理。

不把被测浏览器操作替换成 runtime 直接调用：直接构造只用于 setup，页面导航、点击、表单保存、可见状态和 `pageerror`/`console.error` 仍由真实 Browser 完成。

### 4. 分离核心 smoke、专项 smoke 与 full regression

affected Browser 保留一个短核心路径，覆盖进入 Workspace、Task 路由和一个代表性只读 Tab；Project、Service、Change、Articles 和复杂 Task lifecycle 由路径映射到专项 selector。`test:browser:smoke` 的 all 模式只在显式 full/Candidate 或维护者明确要求时执行。

核心与专项入口分别记录选择原因、selector、fixture profile、阶段耗时和失败诊断；不通过把统一测试超时继续设置得更大来掩盖 fixture 或路径选择问题。

## Risks / Trade-offs

- [Risk] affected path 映射遗漏某个页面资源 → Mitigation：未知的 Local App Web/router 路径选择核心 smoke；selector dispatcher 提供选择原因；full/Candidate 保留 all 回归。
- [Risk] 直接 fixture setup 可能绕过 CLI/Git 真实问题 → Mitigation：CLI/Git lifecycle 继续由 System/专项 Browser fixture 覆盖，setup helper 不取代被测公共操作。
- [Risk] 拆分后失败证据分散 → Mitigation：每个 selector 保留稳定名称、阶段、pageerror/console.error 与临时 fixture 标识，并由 dispatcher 汇总。
- [Risk] 过度收窄 Browser applicability 造成 UI 回归漏检 → Mitigation：维护资源路径映射、核心 smoke 和显式 Candidate/full all；不把 API-only 证据冒充 UI 证据。
- [Risk] 单个 Browser 进程的共享状态污染后续 selector → Mitigation：selector 之间使用明确 fixture reset 或顺序隔离；无法证明隔离时退回每 selector 独立 fixture，不并行共享状态。

## Migration Plan

1. 增加 selector dispatcher 与窄的 Local App HTTP/System owner，先以 plan-only 输出验证选择结果。
2. 重构 Browser fixture/setup 和 selector 参数，保持现有单 selector 命令兼容。
3. 更新 `verification.yml` 与 registry 的 affected/full 选择、资源声明和耗时预算。
4. 运行核心 affected、各专项 selector、HTTP/System 窄入口与显式 full Browser 回归，比较 timing evidence 和失败诊断。
5. 若选择结果或覆盖不符合预期，恢复 dispatcher/capability/registry 的上一版；不涉及运行时数据迁移。

## Open Questions

- 核心 smoke 的代表性 Task Tab 最终选择 `development` 还是更贴近当前页面主路径的 `verification`，需以现有页面覆盖和失败定位成本确定。
- Browser capability 的当前 maturity/enforcement 是否同步调整，需在验证结果稳定后由项目 owner 决定；本 Change 只提供可观察证据，不自动降低必要门禁。
