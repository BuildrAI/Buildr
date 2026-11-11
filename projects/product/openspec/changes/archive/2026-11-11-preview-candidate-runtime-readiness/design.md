## Context

见 proposal.md「Why」。当前事实（工作树抽查）：

- 预览启动 `preview-lifecycle.ts` 仅从工作树 `bin/buildr.mjs` 拉起宿主，`BUILDR_APP_DATA_DIR` 指向 `<dataRoot>/previews/<name>`；`started` 由 Web `/api/v1/health` ready 判定，不等待 Agent 后台。
- 宿主 `modules/agent-service/module.ts` 以 `void start().catch(...)` 即发即忘连接后台；未传 runtime 时客户端自行 `prepareAgentRuntimeAsync`，来源是宿主 `node_modules/@buildr-ai/buildr-agent`——该包在未经准备时来自 npm 安装，未必是工作树源码。
- 运行单元 digest 由私有包 `build/**`、`node_modules/**`、`package.json` 与 Node 二进制内容哈希得出（`runtime-unit.ts`）；`activate-runtime.ts` 与客户端 `awaitRuntime` 已提供“目标 digest 一致且 accepting、无 pending”的就绪观察。
- 开发准备已有 `prepareDevelopmentWeb`（prepare-agent→generate-dtos→build-web，可配 `outputRoot`，分阶段失败报告）；`prepareDevelopmentAgent` 构建并原子换入工作树宿主私有包。预览启动目前不触发这些准备。
- 停止 `stopAgentProcess` 已按数据根覆盖全部后台代次；`--purge` 已删除整个预览根（含 reuse 副本、日志、端口、runtimes）。
- 页面预览身份条由宿主注入 `__BUILDR_PREVIEW_IDENTITY__`、前端 `AppLayout.tsx` 渲染，但当前始终隐藏（`styles.css` `.hidden`，浏览器检查断言隐藏）。

约束：消费 `agent-process-isolation` 已交付的受保留运行单元与换版/就绪机制，不修改其公共契约；保留预览实例/owner/数据模式/停止边界；准备与运行写入只落工作树与预览独立数据根。

## Goals / Non-Goals

**Goals:**

- 让“预览跑的是工作树候选代码”成为启动契约：准备候选产物、钉住 digest、等待候选后台就绪、未就绪 fail closed。
- 让组件级来源（宿主/前端/Agent/数据模式/reuse）在 CLI、health、页面身份条一致可观察。
- 以真实检查证明开发版数据根与原执行零写入。

**Non-Goals:**

- 不修改 Agent 进程公共契约、不新增环境状态库或注册中心。
- 不做历史快照导入/只读查看（后续可选变更）。
- 不新增清理机制（stop/purge 已覆盖）；不共享可写数据根、不代理开发版后台。

## Decisions

### 1. 复用 `prepareDevelopmentWeb` 作为预览准备编排

预览启动（task 模式）在拉起宿主前调用 `prepareDevelopmentWeb({ outputRoot: <工作树 buildr>/web-dist })`，复用其三阶段（私有包→DTO→web-dist）与分阶段失败报告。
- 备选：分别调用 `prepareDevelopmentAgent` 与 `web-dist` 构建——拒绝，重复编排且易漏 DTO 阶段。
- 新鲜度：以工作树源码输入摘要的准备标记（存于工作树受忽略目录）判断是否跳过重准备；源码变化或标记缺失则重新准备。首版宁可重准备也不复用陈旧包。

### 2. 预览计算候选 digest，宿主以 requireRuntime 连接

准备后，预览以工作树已物化私有包计算候选运行单元 digest，并通过环境（如 `BUILDR_PREVIEW_AGENT_DIGEST`）传递给宿主；宿主 `module.ts` 以该 runtime 连接后台并启用 requireRuntime 语义（复用 `awaitRuntime`），避免接受陈旧单元。
- 备选：信任宿主自准备、预览不校验——拒绝，无法证明候选代码生效。
- digest 必须由“已准备”的包计算；MUST NOT 从未准备的工作树 node_modules 计算。

### 3. 就绪观察由 instance-secret 认证的 health 携带 `agentRuntime`

预览只持有实例 secret（`healthSecret`），不持有 agent-service 的随机 `sessionToken`，因此无法调用 `/api/v1/app/agent-service/runtime`。实现改为在现有 `/api/v1/health` 响应中携带非阻塞的 `agentRuntime` 快照（`currentDigest/generation/accepting/pendingDigest` 等），预览在 Web 健康后轮询该字段，直到 `currentDigest===候选 && accepting && !pendingDigest`；超时或不一致触发 fail closed。
- 备选：轮询 `/agent-service/runtime`——拒绝，预览缺少 sessionToken，认证不可达。
- 备选：新增专用就绪端点——拒绝，health 已是预览唯一可达的认证端点，扩展即可。
- health 必须保持响应：`agentRuntime` 读取以短超时 race 包裹并吞错返回 null，激活期间不阻塞 health（仍 ready），就绪轮询独立持有更长预算。
- fail closed 复用现有认证停止路径回收已启动进程，并按数据根 `stopAgentProcess` 停止候选后台全代次；停止未确认则保留现场并报告，不冒充清理。

### 4. 组件级来源扩展现有身份注入，并使预览身份条可见

在现有 `previewIdentity`（owner→env→meta→`AppLayout`）基础上增加 Agent digest/generation/accepting、前端产物来源、数据模式与 reuse 来源；health 与 CLI 输出同步携带。预览身份条对预览可见，默认 Web 无注入仍不显示。
- 备选：新建独立来源 UI——拒绝，复用现有身份条与注入链路。
- 更新浏览器检查中“身份条隐藏”的断言为“预览可见、默认隐藏”；稳定 DOM id/data-* 保留。

### 5. 清理与零写入：只补验证，不改机制

stop/purge 已覆盖全代次与 reuse 快照；本期新增/调整隔离检查证明：准备与运行只写工作树与预览根，开发版数据根、canonical Workspace 与开发版后台执行零写入。

## Risks / Trade-offs

- 准备增加启动耗时 → 新鲜度标记跳过未变化重准备；分阶段进度与失败报告；web 构建失败明确归因。
- 宿主自准备与预览期望 digest 竞争 → requireRuntime + 观察实际 digest 校验，不一致 fail closed。
- 就绪超时遗留孤儿进程 → 复用认证停止回收；未确认停止保留现场并报告。
- 身份条可见改变既有浏览器断言 → 同步更新检查；默认 Web 行为不变。
- 工作树 node_modules 初始陈旧 → 准备先于 digest 计算与宿主启动，绝不从陈旧包计算候选。
- 旧 owner 缺新字段 → 来源字段可选，停止/清理按原 owner 核验，不因缺字段拒绝。

## Migration Plan

1. 预览准备编排与新鲜度标记（复用 `prepareDevelopmentWeb`）。
2. 候选 digest 计算与传递、宿主 requireRuntime 连接、预览就绪等待与 fail closed 回收。
3. owner/CLI/health/页面身份条组件级来源；身份条可见与浏览器检查更新。
4. 隔离检查：候选 digest 生效、未就绪 fail closed、开发版数据根与原执行零写入、purge 全代次覆盖。
5. 向后兼容：新增字段可选；旧实例可停止；不传新语义的既有调用行为不变。回滚即移除准备/钉住/就绪等待，恢复现有 Web 健康判定。