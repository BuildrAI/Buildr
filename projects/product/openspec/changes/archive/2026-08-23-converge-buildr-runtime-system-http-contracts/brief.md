# 收敛 Buildr Runtime/System HTTP 契约与全局一致性

一句话：把 Local App host、Installation release-awareness 与 Publication 接入既有 `Schema → Ajv → DTO → typed Client` 轨道，并用显式 binary/non-HTTP disposition 完成全局 operation coverage，而不改变 Runtime/System ownership。

## 背景与问题

Task、Workspace 与 Agent Assets 已拥有模块内 Schema authority、生成 DTO 和能力 Client；剩余 health/quit、release-awareness 与 Publication 仍由 router、跨进程调用方和页面局部类型分别描述。若没有最后一次闭合审计，新增 route、binary response 或非 HTTP System 能力容易被误报成已迁移或被强行纳入 JSON 管线。

## 目标与非目标

- 目标：为 Local App host、Installation 与 Publication JSON operation 建立稳定 Schema/catalog、严格校验、显式 mapping、生成 DTO、typed Client 和真实 Contract Test。
- 目标：将 Publication asset 作为 binary contract 治理，并为全部实际 HTTP operation 保存唯一 owner/disposition。
- 非目标：不改变 Launcher、Doctor、release transaction、Publication、Installation 或 Web lifecycle authority；不把非 HTTP 能力改造成 API；不引入 OpenAPI、前端 Ajv、Electron 或全量 TypeScript 迁移。

## 受影响用户与角色

- Buildr Web 用户继续使用现有版本提示、文章列表/详情和退出交互，但 payload 漂移会更早在生成检查、typecheck、build 或 Contract Test 中暴露。
- Agent 与发布协作者可以从 operation coverage 看清 migrated JSON、binary、deferred 与 non-HTTP 边界，不必从 router 和页面断言反推契约状态。
- Launcher、Doctor 与 Runtime 调用方继续使用现有 instance secret、protocol identity 和 CLI/Application owner。

## 核心流程

1. Web HTTP、System Installation 与 System Publication owner 登记自身 Schema/operation。
2. Buildr 在模块注册阶段严格编译并复用请求 validator；Interface DTO 显式映射到既有 Application/Runtime port。
3. generator 从同一 Schema 投影两端 DTO，Runtime/System typed Client 供 `AppLayout` 与 Articles 页面消费。
4. 全局 coverage 将实际 routes 唯一分类；binary asset 不伪装成 JSON，Doctor/Launcher/release CLI 明确 not-applicable。
5. Contract/System tests、typecheck、正式 build、tracked `web-dist`、payload/tarball parity 与 Browser Smoke 验收发布形态。

## 关键变化

- Runtime/System HTTP Interface 新增模块内 Schema/catalog 与组合 coverage inventory。
- health/quit 保持安全、协议兼容与 shutdown 顺序；release-awareness/publication 形成生成 DTO 和 typed Client 链路。
- Publication asset 使用 binary response classification 与 JSON error contract。
- 未登记或重复 operation 在正式 contract/drift check 暴露，但不成为 Local App 启动或安全只读工作的运行时许可门禁。

## 影响、风险与兼容性

既有 URL、status、错误 envelope、session/Origin/instance secret、Application writer 和 System ownership 保持兼容。主要风险是 health 跨安装代际兼容、shutdown test 副作用、binary asset 被误纳入 JSON 管线以及全局 coverage 过度门禁化；通过可选 identity 字段、注入 shutdown spy、binary response kind 和离线 contract check 缓解。

## 验收摘要

Runtime/System catalog 与全局 coverage 闭合；生成 DTO 无 drift；真实 JSON/binary/错误/授权契约通过；Buildr 与 Buildr Web typecheck/build 通过；tracked `web-dist`、Application Payload、npm tarball 与代表性 Browser Smoke 对相同契约保持一致；Doctor、Launcher 与非 HTTP release ownership 未改变。

## 技术 Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Runtime/System HTTP contracts spec](specs/runtime-system-http-contracts/spec.md)
- [Implementation tasks](tasks.md)
