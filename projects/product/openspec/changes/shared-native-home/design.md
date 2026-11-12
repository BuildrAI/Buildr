## Context

Codex/DSH 网关模式当前把租约身份复用为目录键：`connection-application.ts` 以 `sha256(gateway.identity)` 生成 `connections/<provider>/model-bindings/<hash>/`，执行器把 `CODEX_HOME`/`DSH_HOME` 挂在该租约目录下（`codex/index.ts`、`dsh/index.ts`）。每个租约一套完整 home，换模型/账号/配置即增殖。绑定身份含 home 目录的 realpath+inode（`native-process.ts` `consumerBinding`/`nativeBinding`），内容解析器靠参与方字段反算租约目录（`native-content-resolver.ts` `configRoot`），fork 跨 home 时复制会话正文（Codex 复制 rollout、DSH `transferFork` export/import）。

Qoder 网关模式已证明共享可行：内容放在 `nativeAccountConfigRoot`（连接级根），租约目录只当进程壳（`qoder/index.ts`）。该共享根接口已传给所有执行器。原生 app（ChatGPT/Codex、DeepSeek Harness）本身全对话共用一个 home，home 级状态库跨对话共享是原生语义。

## Goals / Non-Goals

**Goals**
- 换模型/账号/配置不再新建 home；Codex/DSH 网关模式 home 收敛为每连接一个共享 home。
- 存储增长可约束：会话级回收（已交付）+ 状态库维护 + 死租约 home 整目录回收。
- 历史工具详情、交接、恢复在切换后仍准确可读。

**Non-Goals**
- 不动 Qoder/Qoder CN（内容已共享）、原生登录模式（本就每连接一个 home）。
- 不做字面"全局一个 home"（Codex/DSH home 格式不兼容）。
- 不合并旧租约 home 的 SQLite；不改原生会话格式/压缩；不动 Buildr 可见消息与执行记录数据库。

## Decisions

### D1：home 粒度取"按连接共享"，而非按对话或全局
用户明确选择"一个 HOME"。网关模式 home 指向 `nativeAccountConfigRoot`（默认 `connections/<id>`），与 Qoder 一致、与原生登录模式同根。账号/模型/对话/轮次隔离由网关令牌强制（`model-access` 按令牌路由），目录不是安全边界。home 级状态库（goals/memories/thread_history）按原生语义跨对话共享。
- 不取"按对话"：那是更早讨论的中间方案，用户已改选"一个 HOME"；按对话仍会为环境/状态留多份副本。
- 不取"全局一个"：两家 home 格式不兼容，物理上不可能共用一个目录。
- **取舍**：接受 memory/状态跨对话（乃至同连接跨账号）共享——这是原生语义，也是用户决定；代价是失去对话间状态隔离。工具链/凭据隔离不受影响（仍私有）。

### D2：显式推翻 11-05 "HOME 不合并"中针对原生 home 粒度的部分
`2026-11-05-agent-environment-storage` 的"账号、HOME、原生会话不合并 / 不共享完整 HOME"针对的是**不要用合并 HOME 来实现工具链/缓存共享**。本变更不改变工具链共享机制（仍内容寻址对象 + 共享缓存根、凭据私有），只改变**原生程序自身 home 的粒度**。spec 通过修改「所有Agent默认共用工具运行环境与缓存」把原生 home 语义委托给新要求，消除冲突，不破坏工具链规则。

### D3：租约专属文件外移
Codex `buildr-model-catalog.json`、DSH `buildr-model-gateway.json` 本就经 `-c`/启动参数引用，改写到租约临时路径（`configRoot` 下），不写入共享 home。凭据本就走环境变量，不动。

### D4：绑定与解析双轨，持久化准确路径
绑定身份格式不变（仍含目录 realpath+inode），但网关模式新参与方的 home 目录变为共享根。新参与方持久化准确 home 相对路径；解析器有路径用路径，无则按原租约公式反算（旧数据）。旧数据淘汰后删除旧轨。**不搬目录**（inode 绑定），不合并 SQLite。

### D5：同 home fork 不再复制会话
共享 home 后，源与目标同根：Codex 不再复制 rollout（`source.modelConfig` 与 `this.modelConfig` 同 realpath 时跳过复制）；DSH 不再 `transferFork` export/import（同 host 存储内直接 fork）。跨旧租约 home 的 fork 仍走原复制路径（双轨）。

### D6：状态库维护复用引用证明
在已交付会话级回收的引用清单（对话头、原生工具内容、交接索引）之上，新增状态库线程级候选：完整证明无引用→dry-run 收据→显式确认→清理无引用线程并收缩库。自动维护永不删状态库。任何不确定保留。

## 并发实测（成立前提）

用真实受管 codex 二进制（0.167.0）在隔离临时 home 实测：先初始化一个进程建好 home，再并发启动共 3 个 app-server 共用同一 `CODEX_HOME`，并发创建 12 个线程。结果：**12/12 成功，goals/logs/memories/queue/state 五个 SQLite `PRAGMA integrity_check` 全 ok**——多进程并发写共享 home 不损坏。证据：`.buildr/local/shared-native-home/concurrency-validation.json`（脚本 `concurrency-test.mjs`）。

观察：app-server 线程为**每进程内存态**，`thread/read` 只读本进程已加载线程；跨进程访问须经 `thread/resume` 从共享 rollout 加载（与现有跨 home fork 同机制）。空线程无 rollout，故 turn 级 resume/中断需产生真实 turn。**turn 级并发 resume/中断列为实施阶段集成测试门禁**（复用执行器测试 harness），通过后才算并发验证完整。

## Compatibility / Migration

- **不迁移原生存储**：合并多 home 的 SQLite 不可安全完成；绑定含 inode，搬目录即毁引用。
- 变更后**新参与方**用共享 home；**已有参与方**保留准确旧租约 home，恢复/历史读取/工具详情不受影响（双轨解析）。
- 旧 home 随对话删除/参与方失效失去引用，由 home 级回收清掉；现有死租约目录作为第一批回收对象。
- 原生登录模式与网关模式同根（`connections/<id>`）：网关不读 `auth.json`（凭据走环境变量），模式切换保持 home 连续。

## Risks / Trade-offs

- **跨对话/跨账号状态共享**：memory/目标/线程历史全局化，是用户接受的原生语义；若未来要账号级记忆隔离，需另按账号分根（本期不做）。
- **并发**：并发写已实测安全；turn 级 resume/中断待集成测试门禁。Codex 自带 thread-writer-locks，SQLite WAL 支持多进程。
- **双轨解析**：旧租约反算逻辑脆弱（需重建权限摘要），测试须覆盖旧编码、权限摘要、身份漂移；持久化路径后新数据不再反算。
- **原生登录/网关同根**：需验证两模式先后使用时 `auth.json` 与网关互不干扰。
- **状态库裁剪**：thread_history 有活跃引用，裁剪必须严格引用证明 + 确认门禁，误删即丢证据；任何不确定保留。

## Open Questions

- turn 级并发 resume/中断的集成测试构造（mock 模型网关或真实网关租约），在实施阶段确定并作为门禁。
