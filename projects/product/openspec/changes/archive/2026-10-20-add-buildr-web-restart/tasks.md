## 1. HTTP 契约与路由（services/buildr）

- [x] 1.1 在 `web/http/buildr-web-http-contracts.ts` 新增 `restartRequest`（闭合空对象）与 `restartingResponse`（`status: restarting`）Schema，并登记 `jsonOperation('local-app.restart', 'POST', '/api/v1/app/restart', ...)`；执行 `npm run contracts:generate:runtime-system` 重新生成 DTO，再以 `npm run contracts:check:runtime-system` 证明 Schema 与生成物一致。
- [x] 1.2 在 `web/http/server.ts` 向 router 注入 `restart` 端口（与 `shutdown` 并列的可选注入，默认实现见 2.2）；在 `web/http/router.ts` 新增 `POST /api/v1/app/restart` 分支：`assertWriteRequest` → `validateRequest` → `202 restarting` → 调用 restart 端口；Preview 实例返回稳定拒绝错误且不调用端口；`closing` 期间走既有 `app_shutting_down`。用 `test/integration/runtime-system-http-contract.test.ts` 扩展覆盖：授权请求 202、非法请求无副作用、Preview 拒绝。

## 2. 同身份重启接管（services/buildr）

- [x] 2.1 在 `web/application/instance-lifecycle.ts` 把 `--update-handoff` 的观察/接管分支泛化为 `handoffMode: 'update' | 'restart'`：新增 `--restart <sha256 观察摘要>` 参数（不进入帮助文本，禁止 `--target`，隐含 `--no-open`），npm 渠道断言与安装归属核验只在 `update` 模式执行；同身份接管要求 `buildrWebInstanceObservationDigest` 匹配，实例被替换时保留现场；复用既有启动锁、认证退出、退出等待、首选端口绑定与随机回退。以 `test/component/update-web-handoff.test.ts` 相邻的新组件测试覆盖：`--restart` 接受同身份实例、拒绝摘要漂移、不执行 npm 断言。
- [x] 2.2 实现 restart 端口默认编排：当前实例经 `runtime.currentProductInvocation` 以 `spawn(detached, stdio:[ignore,ignore,ignore,ipc])` 启动 `web --restart <digest> --port <原端口> --no-open` 后继进程，环境沿用 `updatedWebEnvironment` 同款清理，IPC 回报沿用 `buildr.web-update-handoff-failed` 同型消息；失败只写日志不改变已返回的 202。以组件测试覆盖 spawn 参数、环境清理与 IPC 失败回报。
- [x] 2.3 在 `test/system/`（参考 `buildr-web-channel-isolation.test.ts` 的 `quit-instance` 用法）新增重启系统测试：真实实例触发 restart 后，旧 PID 退出、新 PID 在原端口就绪、实例回执更新、health 返回新身份；Preview 实例 restart 返回拒绝且实例继续运行。

## 3. 顶栏入口与页面恢复（services/buildr-web）

- [x] 3.1 在 `src/app/api/runtime-system-api.ts` 新增 `restart()` 客户端，消费 1.1 生成的 `restarting` DTO；`src/app/AppLayout.tsx` 把退出按钮改为 `Dropdown.Button`：主按钮「重启」（`id=restart-buildr`），下拉「退出 Buildr Web」（`id=quit-buildr`）；`previewIdentity` 存在时回退为仅退出按钮。确认框明示「进行中的生成与任务验证将被取消」。`tsc -b`（或正式 `npm run build`）通过。
- [x] 3.2 实现重启进行态：接受后进入全屏「正在重启」（复用 `exit-screen` 同级结构），以 `cache:'no-store'` 周期抓取当前页并解析 `meta[name="buildr-session"]`，令牌变化即 `location.reload()`；约 30 次 ×1s 未确认进入可重试态，提供重试与「重新打开 Buildr Web」指引文案。`node tools/run-logic-tests.mjs` 覆盖令牌比较、超时与重试状态机。
- [x] 3.3 更新 `test/browser-smoke/buildr-web-browser.test.ts` 中断言链：`#quit-buildr` 改为先展开下拉再点击；新增重启旅程（可路由拦截 `/api/v1/app/restart` 模拟 202、失败与轮询恢复路径）。以 `node ../buildr/test/verification/browser-selector-dispatcher.ts --selector <对应选择器>` 或既有等价入口执行受影响的浏览器检查。

## 4. 知识维护与收口

- [x] 4.1 按 `current-knowledge-maintenance` `reconcile` 维护受影响成果：`knowledge/code-map/system-services-assets.md`（实例生命周期行补充重启接管）、`knowledge/docs/architecture/technical.md` 中本地应用生命周期相关表述、`knowledge/docs/guides/getting-started.md` 退出指引补充重启入口；逐项报告 aligned/updated 结果。
- [x] 4.2 运行受影响检查：`npm run test:contract`、`npm run test:component`、`runtime-system-http-contract.test.ts`、2.3 新增系统测试与 3.3 浏览器检查；`npm run typecheck`（buildr 与 buildr-web 两端）通过。失败项修复后重跑，如实报告未覆盖项。
