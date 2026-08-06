## Why

Local App 的 Browser Smoke 当前默认串行执行多个完整用户流程，并重复创建 Git/Workspace fixture、Local App server 与 Chrome；同时部分 HTTP 改动会叠加宽泛的 System 验证，导致 affected feedback 过慢且失败定位不清。现有 selector 已具备拆分基础，但选择机制没有充分利用它们，需要在保持用户可见关键交互覆盖的前提下收窄每次执行范围。

## What Changes

- 增加按 changed paths 解析最小 Browser selector 的统一入口，避免普通 affected 执行默认跑全部 shell、project、service、task、articles 流程。
- 保留一个低成本核心 Browser Smoke，覆盖 Workspace 进入、Task 路由和一个代表性只读 Tab；Project、Service、Articles 及复杂 Task lifecycle 作为按路径选择的专项 Browser 验证。
- 收窄 Browser capability 的适用路径与执行语义：HTTP/API 契约由 HTTP/System 测试负责，只有真实页面、路由、DOM 或浏览器错误变化才触发 Chrome。
- 将 Local App HTTP 相关验证从宽泛 System 集合中拆出可独立定位的轻量入口，避免无关 Workspace lifecycle 被重复选择。
- 减少 Browser fixture 的 CLI/Git/Workspace 生命周期准备与重复启动成本，并为核心与专项入口建立明确耗时预算和失败阶段诊断。
- 保留真实 Chrome、真实用户交互、DOM/路由可见结果及 pageerror/console.error 证据；不以源码文本检查替代 Browser 行为验证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-app-browser-verification`: 修改 Browser selector 的 affected 选择、核心/专项入口、HTTP 与 Browser 的证据边界，以及对应的成本与触发条件。

## Impact

- 影响 `projects/product/verification.yml`、`test/verification/registry.mjs`、changed planner/Browser selector dispatcher 与 Browser Smoke fixture/test 文件。
- 可能新增或拆分 Local App HTTP/System 测试入口，但不改变 Local App HTTP、Web API 或业务运行时契约。
- 影响 Product affected verification 的选择结果、耗时预算、Browser resource 调度与诊断输出；Candidate/full Browser 回归仍保留显式入口。
