# 页面检查更新与分阶段更新

## Why

Buildr Web 页面当前只在挂载时检查一次 npm 发布版本，更新动作只能复制命令或交给 Agent 执行；用户无法在页面内主动、周期地获知新版本，也不能从页面直接完成更新。现在引入该能力，是因为更新所需的全部底层机制已经存在并经过验证：Release Awareness registry 查询与状态持久化、`buildr update` 的 updateAuthority 安装路径、`--update-handoff` 实例交接与启动器绑定刷新。本变更把这些既有能力组合为页面内的分阶段更新闭环，而不是新建更新机制。

## What Changes

- 页面顶栏新增「检查更新」入口：页面可见时按约一分钟周期检查发布轨道，有可安装更新时图标给出提示；点击图标随时手动检查并查看版本详情弹层。
- 新增分阶段更新任务：详情中确认「更新」后，服务端在后台执行 registry 核对与 `npm cache add` 包下载（本机保持可用）；下载就绪后提示用户二次确认；确认后才执行 `npm install --global` 安装与 `--update-handoff` 实例交接重启，重启中断保持秒级。
- 新增 HTTP 操作 `POST /api/v1/update/prepare`、`GET /api/v1/update/status`、`POST /api/v1/update/apply`：与 `app/*` 相同的 Origin/会话令牌写保护、闭合请求 Schema 与统一错误 envelope。
- 更新任务只钉住用户在详情中确认的精确版本（`expectedVersion`）：准备与安装都以该版本为准，不追新版、不降级、不切轨道。
- 仅 npm registry package 安装模式提供该入口；development checkout 与 Preview 实例不提供，沿用现有 release-awareness 对该渠道的行为。
- 无破坏性变更：不改 `buildr update` CLI 行为与 authority 校验，不改 `--update-handoff` 交接语义，不改既有 `release-awareness` 端点契约。

## Capabilities

### New Capabilities

- `web-update-flow`: Buildr Web 页面内的分阶段更新任务——版本钉住、后台下载准备、二次确认、安装与交接编排、任务状态与失败报告语义。

### Modified Capabilities

- `runtime-system-http-contracts`: System Installation HTTP operation 集合扩展，新增 update prepare/status/apply 操作的认证、请求/响应 Schema、错误 envelope 与 coverage 登记要求。
- `buildr-web-client`: 全局顶部 Release Awareness 呈现要求扩展——周期与手动检查、图标提示、版本详情弹层、分阶段更新确认与重启恢复交互。
- `buildr-cli-self-update`: 更新来源识别、updateAuthority、精确版本与网页交接端口的共享语义扩展——网页分阶段更新 MUST 复用同一身份与授权事实，不建立第二套安装路径。

## Impact

- `services/buildr`：`src/infrastructure/process.ts`（异步 spawn 辅助）、`src/modules/installation/application/`（新增更新任务编排）、`src/modules/installation/interfaces/http/`（新增契约与 contribution）、`src/modules/installation/module.ts`（application 方法与 HTTP contribution 注册）、`tools/codegen/contracts/runtime-system-dto.ts`（新增 DTO 生成输入）；受影响测试包括 HTTP 契约、coverage 与更新任务单元/集成测试。
- `services/buildr-web`：`src/features/installation/`（检查入口、详情弹层、更新状态交互与 API client）、`src/app/AppLayout.tsx`（顶栏入口装配）、`build/generated/` 重新生成 DTO；浏览器验收新增更新入口与流程相关稳定 `id`。
- 兼容：`/api/v1/release-awareness` 语义不变，作为新入口的检查数据源继续服务；旧版本页面调用新端点不存在——本变更内页面与运行同一 package，不做跨版本调用承诺。
