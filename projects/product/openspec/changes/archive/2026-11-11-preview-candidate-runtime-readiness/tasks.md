## 1. 预览候选产物准备

- [x] 1.1 在 `preview-lifecycle.ts` task 模式拉起宿主前增加候选产物准备编排，复用 `prepareDevelopmentWeb`（`outputRoot` 指向工作树 `buildr/web-dist`）；准备失败在启动宿主前 fail closed 并报告失败阶段。
- [x] 1.2 增加工作树源码输入摘要的准备标记（存于工作树受忽略目录）：源码未变化复用已准备产物，变化或标记缺失则重新准备；标记与构建写入只落工作树。

## 2. 候选 digest 钉住与就绪等待

- [x] 2.1 准备后以工作树已物化私有包计算候选运行单元 digest（复用 `runtime-unit` 的内容哈希/`prepareAgentRuntime`），MUST NOT 从未准备的 node_modules 计算。
- [x] 2.2 通过环境将候选 digest/runtime 期望传递宿主；`modules/agent-service/module.ts` 以该 runtime 连接后台并启用 requireRuntime 语义（复用 `awaitRuntime`）。
- [x] 2.3 预览在 Web 健康后轮询宿主 instance-secret 认证的 `/api/v1/health` 所携带的 `agentRuntime`（预览不持有 agent sessionToken，不能调用 agent-service 接口），仅当 `currentDigest===候选 && accepting && !pendingDigest` 才返回 `started`；超时或不一致 fail closed 报明确 codedError。
- [x] 2.4 未就绪时复用现有认证停止路径回收已启动进程；停止未确认保留现场并报告，不冒充清理成功。

## 3. 组件级来源可观察

- [x] 3.1 owner 与启动/列表输出增加 Agent digest/generation/accepting、前端产物来源、数据模式与 reuse 来源（可选字段，旧实例缺字段仍可停止）。
- [x] 3.2 health 与预览身份注入（`static-files.ts`、`instance-lifecycle.ts`、`router.ts`）携带组件级来源，不泄露凭证或敏感路径。
- [x] 3.3 `buildr-web/src/app/AppLayout.tsx`、`src/styles.css` 使预览身份条对预览可见并展示组件来源；默认 Web 不显示；保留稳定 DOM `id`/`data-*`。
- [x] 3.4 更新浏览器检查中“身份条隐藏”断言为“预览可见、默认隐藏”。

## 4. 直接验证（隔离检查）

- [x] 4.1 隔离检查证明候选 digest 生效：后台实际 digest 与工作树候选一致，页面请求到达候选后台。
- [x] 4.2 隔离检查证明未就绪 fail closed：digest 不符/超时报告 codedError 并回收，不冒充 `started`、不回退开发版后台。
- [x] 4.3 隔离检查证明开发版数据根、canonical Workspace 与开发版后台执行零写入（覆盖准备、运行与 purge）。
- [x] 4.4 核对 `stop --purge` 覆盖该数据根全部后台代次与 reuse 快照、日志、端口（沿用现有机制，补断言）。
- [x] 4.5 运行受影响服务（buildr、buildr-agent、buildr-web）的静态检查与单元测试。

## 5. 当前知识校准

- [x] 5.1 按最终实现 reconcile 受影响知识：`knowledge/docs/architecture/agent-integration.md`、`technical.md`、`knowledge/code-map/technical-layers.md`、`knowledge/docs/reference/json-contracts.md` 中预览与 agent 来源/就绪说明；含义仍成立的内容保留，不批量改写。