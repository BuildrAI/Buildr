## 1. Contract foundation

- [x] 1.1 在 Workspace 与 Agent Assets HTTP Interfaces 建立模块内 Schema、稳定 `$id`、operation registry，并复用 P0 validator catalog。
- [x] 1.2 建立后端/前端 DTO 生成输入、确定性生成和受影响 scope 的 drift check，确认 Buildr Web 不引入 Ajv runtime。

## 2. Workspace Control Plane

- [x] 2.1 将 Workspace 顶层登记、pick、remove 与 workspace-scoped Workspace/Project/Service/document 路由接入请求/成功/错误 Schema 校验，保留现有安全和错误顺序。
- [x] 2.2 为 Workspace HTTP adapter 建立显式 DTO→Application 映射和 operation coverage，补齐 valid/invalid/unknown field/authorization Contract Test。
- [x] 2.3 新增 typed Workspace capability Client，替换 Workspaces、Projects、Services、Project/Service edit 页面中对应的手写 payload 与散落断言。

## 3. Agent Assets management plane

- [x] 3.1 为 Rules、Skills、Commands、Components、Builtin 和 runtime projection 建立结构化 inventory/query port 与 HTTP adapter；CLI 输出继续独立。
- [x] 3.2 为支持的资产 mutation 建立闭合 request DTO、显式 Application command mapping 和稳定 success/error DTO，保留 writer、ownership、required Builtin、mutation fence 与 projection 规则。
- [x] 3.3 新增 typed Agent Assets Client 和最小管理面消费路径；对本 Child 不实现的 render/sync operation 记录 deferred/not-applicable coverage，不执行旁路副作用。
- [x] 3.4 为每个支持的 Agent Assets operation 添加 request/success/error Contract Test，覆盖无副作用失败、ownership 拒绝和 generated drift。

## 4. Verification and convergence readiness

- [x] 4.1 创建并刷新 Change 同级 `brief.md` 与 `.buildr/knowledge-impact.yml`，记录 Workspace/Agent Assets HTTP authority、生成 DTO、错误兼容和 deferred coverage 的当前认知影响。
- [x] 4.2 运行受影响 Buildr Service Contract/Unit/Integration tests、typecheck、生成 drift check，以及 Buildr Web typecheck、正式 build 和 tracked `web-dist` 检查；修复实现反馈。
- [x] 4.3 完成一个 Workspace 管理读取/编辑与 Agent Assets inventory 的 Browser Smoke/HTTP system evidence，并确认未改变 Task/Runtime/System/Agent Adapter 边界。
