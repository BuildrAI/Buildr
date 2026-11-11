## Why

任务预览当前只证明 Web 宿主健康：启动不准备工作树候选产物，宿主即发即忘连接 Agent 后台，`started` 不保证页面请求到达的是工作树候选 Agent Service。修改 Agent Service 或前端后，预览可能仍跑 npm 安装时的陈旧私有包或旧 `web-dist`，无法证明改动生效，违背“从任务工作树用真实页面验收改动”的目标。现有运行身份只覆盖宿主 checkout，缺少 Agent 组件来源与就绪事实。

## What Changes

- 任务预览启动前 MUST 在任务工作树准备候选产物：构建 Agent 私有包并物化到工作树宿主 `node_modules/@buildr-ai/buildr-agent`，构建 `web-dist`（含 DTO）；工作树源码相对上次准备发生变化时 MUST 重新准备。
- 预览 MUST 钉住候选 Agent 运行单元 digest：以工作树已物化私有包计算候选 digest，宿主以该 runtime 连接后台，预览等待后台 `currentDigest` 与候选一致且 `accepting` 才宣告 `started`。
- 候选后台未就绪（digest 不符、未 accepting、换版待定或超时）MUST fail closed，报告明确 codedError 并回收已启动进程，MUST NOT 静默回退开发版后台或冒充启动成功。
- 启动输出、受认证 health 与页面预览身份条 MUST 表达组件级来源：宿主工作树与 Product checkout、前端产物来源、Agent digest/generation/accepting、数据模式（shared/snapshot）与 reuse 来源；预览身份条 MUST 对预览可见（当前实现始终隐藏），默认 Buildr Web 仍不显示。
- 停止与清理沿用现有 `stop`/`--purge`（已覆盖该数据根全部后台代次与 reuse 快照、日志、端口）；本变更补充开发版数据根与原执行零写入的真实检查证据，不新增清理机制。
- 兼容：新增事实以可选字段出现，不传新语义的既有调用保持兼容；无 **BREAKING**。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `worktree-buildr-web-preview`: 新增候选产物准备与运行单元 digest 钉住、候选后台就绪等待与 fail-closed、组件级来源（含 Agent digest/generation 与数据模式/reuse 来源）可观察且预览身份条可见的要求；保留既有实例/owner/数据模式/停止边界。

## Impact

- `services/buildr/src/web/application/preview-lifecycle.ts`：启动前准备编排、候选 digest 计算与传递、后台就绪等待、owner 与启动输出的 provenance 字段、未就绪回收。
- `services/buildr/src/modules/agent-service/module.ts`：以候选 runtime 连接后台（requireRuntime 语义），向 health/HTTP 暴露就绪事实。
- `services/buildr/tools/development/`：复用 `prepare-development-agent`、`web-dist` 构建与 DTO 生成入口，新增预览准备编排与新鲜度判断。
- `services/buildr/src/web/http/static-files.ts`、`instance-lifecycle.ts`、`router.ts`：预览身份注入与 health provenance 字段。
- `services/buildr-web/src/app/AppLayout.tsx`、`src/styles.css`：预览身份条可见并展示组件级来源；更新对应浏览器检查的隐藏断言。
- 验证：新增/调整隔离检查证明候选 digest 生效、未就绪 fail-closed、开发版数据根与原执行零写入。
- 当前知识：实施后按 assess 结果校准预览与 agent-integration 相关说明。
- 依赖基础：消费 `agent-process-isolation` 已交付的受保留运行单元、换版与就绪观察机制，不修改其公共契约。