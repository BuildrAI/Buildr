# Contract、Bootstrap 与最终旧路径收敛

## 一句话摘要

完成 Buildr Service 第二轮模块迁移的最终 owner 收敛，并以行为回归证明公共 JSON、Release、内部 Task 路由与 Web HTTP 安全边界不变。

## 背景与问题

前三个 Child 已交付内容生命周期、Workspace Control Plane、Task Execution 与 Verification 的模块边界，但少量顶层全局 helper、内部 route 和单体 Web HTTP host 仍未归入最终 owner。这些残留让 Bootstrap、Doctor、release tools 与验证清单继续依赖迁移前路径，也使第二轮无法形成“每个生产事实只有一个 owner”的完整结果。

## 目标与非目标

目标是迁移现有 public JSON identity/envelope、release version 与 internal workflow route，完成 Web HTTP 全量职责拆分、Bootstrap/测试/文档/旧路径清理，并补齐 Parent 对第三 Contribution 的可审计 supersede 处置。

非目标是完整 JSON Schema、Ajv、DTO 自动生成、typed client、Web UI 改版、公开契约变化或重做第三 Child 实现。

## 受影响用户或角色

- Agent 与自动化：继续消费相同 public JSON identity、CLI 退出语义和内部 Task driver 入口。
- 本机 Buildr Web 用户：继续获得相同 Session、Origin、Secret、静态资源、shutdown 与 HTTP 响应行为。
- Buildr 维护者：获得明确 owner map、旧路径零残留和可独立验证的 HTTP/route/release 边界。

## 核心流程

1. Bootstrap 通过 Task module 公开入口把 `__internal` route 交给 router。
2. router 根据 Task contract catalog 选择 runner，runner 调用既有 Application Service。
3. Web server 组装 session/static/router/response 模块并管理 loopback server 生命周期；router 保持原有请求匹配顺序。
4. 各模块从 Infrastructure Contracts 生成现有 public JSON envelope；System Installation 与 release tools 复用同一 release version Domain。

## 关键变化

- 新 owner：`infrastructure/contracts/public-json.mjs`、`system/installation/domain/release-version.mjs`、`task/contracts/internal-workflow-route-catalog.mjs`、`task/interfaces/internal/workflow-route-router.mjs`。
- Web HTTP 拆分为 server、router、session/request security、static files 与 responses。
- 删除顶层 `src/application`、`src/domain`、`src/interfaces` 的最终生产残留并更新验证 owner map。

## 影响、风险与兼容性

主要风险是 HTTP route order/header、相对 import 与 release tool source path 漂移。通过先固化行为测试、单向依赖设计、旧路径全仓断言以及 affected/full candidate verification 控制。没有数据 migration 或破坏性兼容变化。

## 验收摘要

- 五项必做范围全部完成，旧路径和旧 import 为零。
- Web HTTP 安全与响应、public JSON、internal route、release tools 和架构边界验证通过。
- current knowledge 与 `docs/architecture/service-architecture.md` 反映最终 owner。
- Parent Handoff delivered `contract-composition-convergence`，并显式 supersede `task-execution-verification` 的历史 Parent evidence 缺口。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [Delta Specs](specs/)
