## 1. 验证选择机制

- [x] 1.1 实现 `test:browser:changed` selector dispatcher，读取 changed paths，输出稳定的 selector、选择原因与显式 full/affected 模式。
- [x] 1.2 为 Shell、Project、Service、Change、Task、Articles 建立路径映射、未知 Local App Web 路径的核心 fallback，以及无 Chrome/无 changed input 的明确诊断。
- [x] 1.3 将 `product.browser-smoke` 的 affected invocation 接入 dispatcher，保留 `test:browser:smoke` 和现有单 selector 命令作为显式 full/诊断入口。

## 2. HTTP/System 与 Browser 边界

- [x] 2.1 新增 Local App HTTP 窄 System test owner，覆盖真实 server、HTTP response、session、错误和只读边界，并确认失败可独立定位。
- [x] 2.2 调整 verification registry 的 inputs、inputExclusions、预算和资源声明，避免 Local App HTTP 改动仅因宽泛路径触发完整 Workspace system suite。
- [x] 2.3 更新 `projects/product/verification.yml` 与 changed planner 契约，证明 HTTP-only 改动不启动 Chrome，页面/路由/DOM 改动仍选择对应 Browser selector。

## 3. Browser fixture 与测试实现

- [x] 3.1 重构 Browser Smoke 参数，使一次 selector 集合共享 clean controller、最小 fixture、Local App/preview server 和 Browser context，并保持失败后完整清理。
- [x] 3.2 按核心、Project、Service、Change、Task、Articles profile 减少无关 CLI/Git/Workspace fixture 准备；保留公共 CLI/Git lifecycle 的必要 Browser/System 证据。
- [x] 3.3 保留真实页面导航、点击、表单、DOM 可见结果、pageerror 与 console.error 断言，去除与 Browser 用户行为重复的低层状态断言。
- [x] 3.4 为 affected 核心/专项与显式 full 入口设置独立耗时、阶段诊断和 selector-level failure output，不通过扩大总超时掩盖慢点。

## 4. 验证与回归

- [x] 4.1 增加 planner/dispatcher contract tests，覆盖 HTTP-only、单资源 Web、跨资源 Web、未知路径和显式 full 选择。
- [x] 4.2 运行核心 Browser Smoke、各专项 selector、Local App HTTP/System 窄入口与既有单 selector 命令，记录 timing evidence 和 cleanup evidence。
- [x] 4.3 静态确认显式 full Browser 入口仍保留、affected gate 不调用 full，dispatcher 只启动一个 Browser runner 且资源声明保持串行；本任务不重复执行长时间 full 回归。
