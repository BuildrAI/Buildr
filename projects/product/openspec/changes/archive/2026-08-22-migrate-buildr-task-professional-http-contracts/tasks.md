## 1. 专业契约 authority 与生成投影

- [x] 1.1 盘点并登记 Environment、Development、Review、Verification、Retrospective、Finish、Execution Record、Parent Coordination 的实际 HTTP operations、稳定 `$id`、request/response/error Schema 与 owner mapping。
- [x] 1.2 复用 P0 的 strict Draft 2020-12 compiler/registry，在 Task HTTP Interfaces 建立 professional catalog，并补齐 strict unknown/missing/type 与不变异测试。
- [x] 1.3 扩展确定性 DTO generator、backend/web tracked generated DTO 与 drift check；生成物包含 source identity，且 Buildr Web 不引入 Ajv。

## 2. Buildr 专业 HTTP 边界

- [x] 2.1 为 read executor 的 overview、development、reviews、verification、coordination、execution-records、detail、body 建立 schema validation 与显式 DTO → Application/read-worker mapping。
- [x] 2.2 为 retrospective GET/PATCH 与 review prompt POST 接入 schema validation 和显式 mapping，保持 Origin/session/body、digest、conflict、terminal 与错误优先级。
- [x] 2.3 建立真实 HTTP Contract Test，覆盖合法成功响应、统一错误 envelope、未知/缺失/非法字段、不变异、Execution Record 白名单和 writer/worker authority 边界。

## 3. Buildr Web 类型化消费

- [x] 3.1 按能力新增 professional typed clients，消费 generated DTO 并保留低层 transport；迁移 Task Detail 的 overview/development/review/verification/coordination/execution-record/retrospective 调用。
- [x] 3.2 删除本次迁移 operation callsite 的手写 response DTO、低层 transport 直呼与无边界 assertion，保持既有页面状态、DOM 钩子、错误展示和交互语义。（prompt 与 Execution Record 已通过 generated DTO/typed client 和显式 ViewModel 类型收敛；其余既存页面 ViewModel `any` 属展示兼容层，作为后续 UI 类型治理，不阻断本 Change。）
- [x] 3.3 运行生成 drift check、Buildr 与 Buildr Web typecheck、正式 web-dist build，并修复本 Change 范围内的类型或打包问题。

## 4. 认知与收敛准备

- [x] 4.1 创建 Change Brief 与 `.buildr/knowledge-impact.yml`，通过 current-knowledge assess 对 technical architecture、buildr/buildr-web Service knowledge 和 terminology 影响作出真实分类。
- [x] 4.2 运行 affected Contract Test、Task Browser Smoke 与必要的产品验证；记录未迁移 operation 的诊断但不扩大本 Change 范围。（Task Browser Smoke fixture 约需 152 秒，selector 预算调整为 300 秒后通过。）
- [x] 4.3 完成 current-knowledge reconcile，确认 authority、兼容性、风险和验收事实与最终实现一致，并修复本 Change 范围内的 unresolved 项。
