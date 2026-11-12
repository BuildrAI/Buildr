## Why

Codex/DSH 网关模式把"租约身份"（账号×模型×对话×配置）复用为目录键，每个租约一套完整原生 home；换模型/账号/配置即新建 home，旧的不清。实测 Codex 已堆到 213 个租约目录约 2.8G，DSH 99 个。原生 app（ChatGPT/Codex、DeepSeek Harness）本身是"所有对话共用一个 home"，home 级状态库跨对话共享是原生语义；本机 `~/.codex` 因无回收涨到 4.8G。用户已明确决定采用"一个 HOME"，并要求配套状态库维护一次到位。现在需要把网关模式的 home 粒度从"按租约"降为"按连接共享"，消除增殖与重复，并约束共享 home 的增长。

## What Changes

- Codex/DSH 网关模式的原生 home 从"按租约哈希目录"改为"按连接共享根"（复用现有 `nativeAccountConfigRoot`，Qoder 网关模式已用此机制）；换模型/账号/配置不再新建 home。原生登录模式不动（本就每连接一个 home）。
- 租约专属模型配置文件（Codex `buildr-model-catalog.json`、DSH `buildr-model-gateway.json`）外移到租约临时路径，经启动参数引用，不占共享 home。
- 参与方持久化准确 home 路径，内容解析双轨（新数据用持久化路径，旧数据按原租约公式反算）；同一共享 home 内 fork 不再复制会话正文。
- 新增状态库维护：复用已交付的完整引用证明，`dry-run→确认` 门禁，清理无引用线程并收缩库；任何不确定保留。
- 死租约 home 在完整证明无引用后整目录回收（在已交付会话级回收之上增加 home 级类别）。
- **BREAKING（数据语义）**：home 级状态（goals/memories/线程历史）改为跨对话共享（原生语义），账号/模型/对话隔离由网关令牌强制而非目录；显式推翻 `2026-11-05-agent-environment-storage` 的"账号、HOME、原生会话不合并 / 不共享完整 HOME"决策中针对原生 home 粒度的部分。
- 并发安全作为成立前提：真实多进程共 home 写入/恢复/中断实测（并发写已实测通过，turn 级恢复/中断列入实施集成测试门禁）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-storage-lifecycle`: 原生 home 共享粒度（按连接而非按租约）、隔离语义（网关令牌而非目录）、home 级状态跨对话共享、状态库维护、共享 home 并发安全、死租约 home 整目录回收。

## Impact

- `services/buildr-agent/src/executors/codex/index.ts`、`executors/dsh/index.ts`：home 键指向共享根、租约文件外移、同 home fork 不复制。
- `services/buildr-agent/src/application/connection-application.ts`：网关模式 configRoot 与共享 home 根的关系。
- `services/buildr-agent/src/application/native-content-resolver.ts` 及参与方持久化：准确路径 + 双轨解析。
- `services/buildr-agent/src/storage/`：状态库维护候选与 home 级回收类别，复用引用证明与条件执行链路。
- 规范：更新 `agent-storage-lifecycle` 中 11-05 引入的"HOME 不合并/原生会话隔离"表述，消除与本变更的冲突。
- 不改动：Qoder/Qoder CN（内容已共享）、原生登录模式、原生会话格式/压缩策略、Buildr 可见消息与执行记录数据库。
- 迁移：不合并旧租约 home 的 SQLite（无法安全合并、绑定含 inode）；新参与方用共享 home，旧 home 失去引用后回收。
