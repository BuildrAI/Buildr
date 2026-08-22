## Context

前三个 Child 已把内容生命周期、Workspace Control Plane、Task Execution 与 Verification 的生产职责迁入模块 owner。当前残留集中在五处：跨模块使用的 `src/application/json-contracts.mjs`、`src/domain/release-version.mjs`、顶层 internal route inventory/router、包含安全/路由/静态资源/生命周期全部职责的 `src/web/http/server.mjs`，以及引用这些旧路径的 Bootstrap、Doctor、release tools 与验证清单。

本批是结构迁移，不改变公开 CLI/HTTP/JSON、SQLite、事务、锁、运行副作用或 writer authority。第三 Child 已交付到 canonical `dev`，但缺少 Parent Contribution binding；本 Child 只复核最终 owner/旧路径，并在 Handoff 中显式 supersede 该 evidence 缺口。

## Goals / Non-Goals

**Goals:**

- 为现有 public JSON identity/envelope、release version、internal workflow routes 和 Web HTTP 职责建立唯一 owner。
- 让 Bootstrap 只组合公开模块入口，并删除无 owner 的顶层 `application`、`domain`、`interfaces` 生产目录。
- 以自动化结构测试和行为回归证明 HTTP 安全、响应、内部路由和 release tools 行为等价。

**Non-Goals:**

- 不引入完整 JSON Schema、Ajv、DTO 自动生成或 buildr-web typed client。
- 不修改任何 public JSON schema identity、HTTP path/method/DTO、Session/Origin/Secret/body limit/shutdown 行为。
- 不重做第三 Child 的 Task/Verification 实现，不伪造其历史 Development binding。
- 不调整 Web UI 或前端信息架构，因此不需要 UI Prototype。

## Decisions

### 1. 公共 JSON 技术机制归入 Infrastructure Contracts

将 `PUBLIC_JSON_SCHEMAS` 与 `withJsonSchema` 原样迁到 `src/infrastructure/contracts/public-json.mjs`。它们是跨模块复用的序列化技术机制，不是某个业务 Application Service；把它们留在顶层 Application 会制造虚假的全局业务层，把全部 identity 拆散到各模块又会在本轮扩大 registry 与 coverage 语义。

备选方案是建立完整 `task/contracts/public-json` 并按模块拆 registry；这需要重新设计 schema discovery 和 typed DTO，留给 `evolve-buildr-http-contract-system`。

### 2. Release Version 是 System Installation Domain

将纯 SemVer parse/compare/default-track 规则迁到 `src/system/installation/domain/release-version.mjs`。Release Awareness Application 与 `tools/release` 复用同一文件，不复制规则。release tools 可以读取产品 Service 的 Domain 源码，但 Domain 不反向依赖 tools 或 Infrastructure。

### 3. Internal Workflow Route 分为 contract、router 和 runner

`src/task/contracts/internal-workflow-route-catalog.mjs` 只保存 frozen route 描述与 inventory projection；`src/task/interfaces/internal/workflow-route-router.mjs` 只按 route id 选择 runner；`src/task/module.mjs` 是 Bootstrap 可见的公开组装入口，负责把实际 internal runners 注入 router。Task Application Service 继续拥有真实用例，router 不复制业务逻辑。

采用注入 runner map 而不是 router 反向动态导入 `task/module.mjs`，避免模块循环。Doctor 和 package static validation读取 Task catalog，不通过 Bootstrap 复制清单。

### 4. Web HTTP 以 Host 生命周期为中心拆窄文件

保留 `server.mjs` 作为 `createLocalWorkspaceServer` 唯一公开入口，仅负责依赖组装、secret/token 生成、HTTP server listen/close 与 read executor 生命周期。拆出：

- `responses.mjs`：JSON/text/binary/prototype response 与 error mapping；
- `session.mjs`：JSON body limit、Origin/session/content-type 校验与字段白名单；
- `static-files.mjs`：dist root、路径穿越防护、content type、index 注入与静态文件响应；
- `router.mjs`：按现有顺序分发 shell/static/health/contribution/shutdown/workspace API/404。

router 接受 closed context 与 callback，不生成 Secret、不 listen、不拥有 shutdown resource。分拆保持现有判断顺序，避免静态资源、贡献路由和 Task query guard 的优先级漂移。

### 5. 最终旧路径由架构验证 fail closed

更新 architecture verifier、verification registry 和相关 contract tests，要求新 owner 存在并拒绝旧顶层文件。迁移完成后 `src/application`、`src/domain`、`src/interfaces` 不再保留生产文件；Bootstrap 只能通过 Task module 进入 internal route router。

## Risks / Trade-offs

- [HTTP 拆分改变判断顺序或 header] → 先把现有行为固化为 System/contract 测试，再按原顺序提取纯 helper，运行完整 local-app HTTP 与 channel isolation 回归。
- [大量相对 import 迁移遗漏] → 使用全仓 `rg` 断言旧路径零引用，并运行 architecture、package parity、release 与 public JSON tests。
- [Task router 形成循环依赖] → router 只接收 runner map，Task module 单向导入 catalog/router/runners，Bootstrap 只导入 Task module。
- [Release tools 与产品源码路径失配] → release tools 和 candidate-release fixtures 同步更新，并运行 cold-start/release contract tests。
- [集中 public JSON registry 仍是跨模块依赖] → 本轮明确其为 Infrastructure Contracts 技术机制；模块级 schema/DTO ownership 留给已排除的后续 contract-system Change。

## Migration Plan

1. 先添加新 owner 文件和结构回归测试，再切换全部生产与工具 import。
2. 提取 Web HTTP helper/router，保持 `server.mjs` public export 与调用者不变。
3. 更新 Bootstrap、Doctor、static validation、verification selectors、架构文档和旧路径断言。
4. 运行 affected 验证、HTTP 安全回归、release/public JSON/internal route tests 与 full candidate verification。
5. Converge OpenSpec delta 后，形成 Child Contribution Handoff；其中 `contract-composition-convergence` 为 delivered，`task-execution-verification` 以 current canonical 实现和验证证据标记 superseded。

回滚只需回退本 Child 的单一未共享提交；没有数据迁移、schema mutation 或远端运行时状态需要回滚。

## Open Questions

无。目录 owner、排除范围和 Web HTTP 全量拆分均已由用户与 Parent Plan 确认。
