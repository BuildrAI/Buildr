# 建立 Buildr Task Record HTTP 契约参考切片

一句话：用 Task Record 的 list、detail、update、complete、abandon 打通第一条 `JSON Schema → Ajv → Application mapping → generated DTO → typed Client → 页面` 样板流水线。

## 背景与问题

当前 Task HTTP 输入边界由 handler 白名单维持，响应形状由 Application 与页面手写类型/断言隐式约定。它能工作，但字段漂移只能在页面运行或人工联调时暴露，也没有可复制的模块契约方法。

## 目标与非目标

- 目标：Task HTTP Interfaces 拥有五个 operation 的 Draft 2020-12 Schema；服务端严格且不变异地校验；两端 DTO 从同一 authority 生成；Buildr Web 通过能力级 typed Client 消费；真实 HTTP 与正式 `web-dist` 验证链路。
- 非目标：不迁移全部 HTTP API，不改变 Task Domain/Application/Persistence/SQLite/writer/lifecycle，不建立全局业务 Schema 仓库或 completeness gate，不引入新的页面信息架构。

## 受影响用户与角色

- Buildr 用户获得更稳定的 Task 列表、详情与终态操作错误行为；页面交互保持等价。
- 开发者和 Agent 在修改 Task HTTP 字段时，可以在生成、typecheck、Contract Test 或正式构建阶段看到漂移，而不是依靠页面猜测。

## 核心流程

1. Task HTTP owner 修改 Schema 与 operation catalog。
2. Buildr 模块加载时严格编译并复用请求 validator，handler 显式映射 DTO 到既有 Application input。
3. 构建期 generator 更新后端与前端 tracked DTO，drift check 防止第二 authority。
4. Task typed Client 消费生成 DTO，页面只维护 ViewModel/交互状态。
5. 真实 HTTP Contract Test 与正式 `web-dist` Task Browser Smoke 共同验收。

## 关键变化

- Infrastructure 新增通用 Ajv compiler；Task HTTP Interfaces 新增业务 Schema/catalog/mapping。
- Buildr 增加 Ajv runtime dependency与固定 DTO 生成开发依赖；Buildr Web 不增加 Ajv。
- 五个 operation 的请求、成功响应和错误响应成为可执行契约，未迁移 route 只形成诊断。

## 影响、风险与兼容性

- 公开路径、payload major、错误 code/status/优先级保持兼容；特殊路径字段、并发 digest、terminal/domain error 不被一般 Ajv 错误覆盖。
- response Schema 初次建模可能遗漏合法可选字段，由真实 Application fixture 和 Contract Test 收敛。
- generated 文件是同一 Schema 的 tracked 投影，文件头和 drift check 禁止把它当作手写 authority。

## 验收摘要

- 五个 operation 的合法/非法真实 HTTP 请求通过 Contract Test，真实成功/错误 payload 通过对应 Schema。
- Ajv 不转换类型、不填默认值、不删除字段，validator 在加载时编译复用。
- 后端/前端 generated DTO 无 drift，Buildr/Buildr Web typecheck 与正式 build 通过。
- 正式 tracked `web-dist` 的 Task Browser Smoke 通过，既有页面交互等价。

## 技术 Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [HTTP contract reference pipeline delta](specs/http-contract-reference-pipeline/spec.md)
- [Task Record delta](specs/task-record/spec.md)
- [Implementation tasks](tasks.md)
