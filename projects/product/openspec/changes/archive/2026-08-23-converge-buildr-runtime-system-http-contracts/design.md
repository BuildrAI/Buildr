## Context

P0/P1 已建立严格 Draft 2020-12 编译、模块内 operation registry、构建期 DTO 投影和能力级 typed Client。剩余 HTTP surface 分散在 Local App router、System Installation module 和 System Publication contribution：health/quit 同时被浏览器、Launcher 与本机进程管理消费，release-awareness 与 publications 仍由页面手写类型断言，Publication asset 则是有意的 binary response。Doctor、Launcher 安装和 release transaction 本身是 CLI/Application 能力，并不是遗漏的 HTTP API。

本 Change 是 Parent 最后一个 Contribution，既要迁移真实 Runtime/System HTTP 边界，也要给全部 Local App operation 一个可审计终态，但不能为了全覆盖而把非 JSON、非 HTTP 或尚无等价 Schema 的能力强行纳入统一 JSON DTO。

## Goals / Non-Goals

**Goals:**

- 让 Local App host、Installation release-awareness 和 Publication 各自拥有稳定 operation、模块内 Schema authority、严格校验和真实 Contract Test。
- 保留 health/quit 的跨进程身份与 shutdown 语义，并让 binary Publication asset 以显式 response kind 被审计。
- 让 Buildr Web 的 release-awareness 和 Publication 页面通过生成 DTO 与能力 Client 消费契约。
- 建立全局 operation inventory 与闭合集合检查，使 migrated、binary、deferred、not-applicable 都有 owner 和理由。
- 用 generated drift、typecheck、正式构建、Application Payload、tarball parity、tracked `web-dist` 和 Browser Smoke 证明发布形态一致。

**Non-Goals:**

- 不改变 Runtime、Launcher、Installation、Publication、Doctor 或 release transaction 的 Application/Domain/Infrastructure ownership。
- 不把 Doctor、Launcher CLI、release CLI 或其他非 HTTP 能力改造成 HTTP API。
- 不为 binary body 建立虚假的 JSON Schema，不在浏览器安装 Ajv。
- 不引入 OpenAPI、额外 Web framework、Electron、Agent Adapter 或全量 TypeScript 迁移。

## Decisions

1. **Schema authority 继续归具体 Interface owner。** Local App host contracts 放在 Web HTTP interface，release-awareness 放在 System Installation HTTP interface，Publication contracts 放在 System Publication HTTP interface；Infrastructure 只复用 validator/identity 技术机制。相比建立全局业务 Schema 仓库，这能保持 owner、Application mapping 和错误语义一致。

2. **全局 catalog 组合模块公开 operation，而不复制 Schema。** Bootstrap/Web host 只收集各 contribution 暴露的 operation metadata，并与实际 route inventory 做闭合集合检查。每项 disposition 为 `migrated-json`、`migrated-binary`、`deferred` 或 `not-applicable`，且非迁移项必须有 owner 与理由；未知 route 使检查失败，因为它会导致 Parent 错误宣称完成，但 catalog 不成为请求分发器或 writer gate。

3. **请求契约区分 body、route 参数与受信 header。** GET/无 body operation 使用闭合空 request DTO 表达无 query/body 输入；path 参数先规范化后作为 Interface DTO 校验。health/quit-instance 的 instance secret 与 app quit 的 session/Origin 仍由现有 security boundary 验证，不进入生成给页面的普通业务 DTO，也不改变安全检查优先级。

4. **quit 保持现有兼容输入。** `/api/v1/app/quit` 继续允许当前空 JSON body，校验后只映射为 shutdown command；未知字段被稳定拒绝。`quit-instance` 的现有无 body 跨进程调用保持有效，不要求调用方补造 JSON body。响应继续为 `202 {status:"stopping"}`，且必须先写响应再触发 shutdown。

5. **binary operation 是一等契约分类。** Publication asset registry 记录 `responseKind: binary`、请求参数、错误 Schema 与内容类型/路径安全 Contract Test，不提供 success JSON Schema。相比把它标成 deferred 或把 Buffer 包进 JSON，这一分类既能闭合 coverage，也不会破坏下载语义。

6. **成功响应校验以 Contract Test 为主。** 生产请求使用编译复用的 Ajv 严格校验；release-awareness/publication 的 Application 结果经显式 DTO mapping。生产成功响应不默认重复 Ajv 校验，以避免在 health/quit 与跨进程探针上增加故障面；真实 HTTP tests 用同一 Schema 校验成功与错误响应。

7. **typed Client 只收敛业务页面的猜测。** 低层 `api()` 继续返回 `Promise<unknown>`；新增 Runtime/System client 消费生成 DTO，`AppLayout` 与 Articles 页面删除对应手写响应类型和 `as`。health secret probe、instance lifecycle 与 binary asset URL 保持后端/浏览器原有专用调用方式。

## Risks / Trade-offs

- **[Risk] health Schema 过窄会阻断不同安装代际的实例复用。** → Schema 保留当前可选 identity/profile 字段和版本化 payload，Contract Test 覆盖 development、npm/launcher 与 preview 形态；协议兼容仍由现有 instance lifecycle 判断。
- **[Risk] shutdown 测试可能提前终止测试 host。** → 使用可注入 shutdown spy 和独立真实 HTTP fixture，锁定授权、响应先后与单次调用，不操作用户正在运行的实例。
- **[Risk] Publication asset 路径和 MIME 处理被 JSON 管线误伤。** → binary operation 不进入 JSON response validator，只校验 route 参数/错误并保留现有 binary responder。
- **[Risk] 全局 coverage 退化为阻止安全局部开发的总门禁。** → 仅对正式 catalog/contract check 报告未知 operation；runtime 路由不依赖 coverage check 启动，deferred/not-applicable 仍是合法闭合状态。
- **[Risk] tracked `web-dist`、payload 与 tarball 增加验证成本。** → 开发期先跑 affected contract/typecheck/build；重型 parity 只在稳定 Content Target 和正式 Candidate 阶段执行。

## Migration Plan

1. 建立三个 owner 内的 Schema/operation catalog 和组合 coverage inventory，先用测试锁定现有 route、安全与响应行为。
2. 接入严格 request validation、显式 Application/response mapping 和 binary disposition，保持 URL、status、security 与 shutdown 顺序。
3. 扩展构建期 DTO 生成/drift，新增 Runtime/System typed Client 并替换 release-awareness、Publication 页面断言。
4. 完成 current knowledge、affected/full verification、tracked `web-dist`、payload/tarball/browser evidence，再执行确定性 OpenSpec convergence/archive。
5. 若发生兼容回归，回滚新增 contracts/catalog/client 与生成投影；原 Application、router contribution 和 CLI ownership不迁移，因此无需数据回滚。

## Open Questions

- 无阻塞问题。未来新增 HTTP operation 必须在所属模块声明 Schema 或明确 binary/deferred disposition；是否进一步生成 OpenAPI 不属于本 Parent。
