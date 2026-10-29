# 进程独立化候选实现

本轮复用 `codex/agent-process-isolation` 工作树（Worktree）。实施前同步 `dev` 到 `b77f58668`，冻结前快进到 `2b88ffe3d`，后者只有发布版本准备。实施阶段未提交或激活；用户后续已要求收尾，具体交付与激活事实以本任务当前结果为准。真实账号及跨平台项未完成，保留当前变更（Change）及未勾选事项，不以本轮交付冒充完整 A11 验收。

## 三组边界

| 契约（Contract） | 唯一声明与承载 | 关键行为 |
|---|---|---|
| 执行操作（Agent Operations） | `buildr-agent/src/process/operations.ts`、`operation-schemas.ts`、`process/client.ts` | 异步操作、认证回环传输、二进制附件和观察事件；保留原请求核对入口，丢失响应不自动重发 |
| 宿主能力（Host Capabilities） | `execution-contracts.ts`、`application/host-context.ts`、`process/host-channel.ts` | 以来源、对象和观察版本解析执行环境、核验可选关联及发现查询范围；不可达与失效分开，已受理执行不依赖宿主持久在线 |
| 运行管理（Lifecycle） | `process/server.ts`、`ownership.ts`、`runtime-unit.ts`、`handoff.ts` | 同配置域单持有、准确身份、忙闲、保留代码/完整依赖/Node.js、原子空闲交接与安全失败恢复 |

Buildr 的 `modules/agent-service/module.ts` 只提供业务权威与公共客户端（Client）装配，网页入口保持地址、认证和业务映射。核心装配位于 `buildr-agent/src/application/agent-service.ts`，不导入 Buildr 内部模块。业务材料、任务状态、提交说明校验与草稿保护继续归 Buildr。原生连接、模型转接、对话、交接、待回应及私有数据由独立后台持有。

## 已执行的直接检查

- 真实 Buildr 主程序连续重启两次，后台代次及原生上下文保持，待答问题保留；重启后可回答并准确停止原工具。
- 最小宿主（Host）在复制后的运行目录使用同一公开入口；两个并发宿主复用一个后台，两个数据根分别持有自己的后台；脱离 Buildr 业务模块运行。
- 宿主失联后保留原执行，新创建需要重新核验；两个来源同编号隔离，旧环境观察拒绝；附件真实传输及认证拒绝均覆盖。
- 待审批时不切换；空闲后采用新版；新版启动失败恢复旧运行单元；交接进程中断后按准确释放记录接续；不兼容契约（Contract）或较新数据拒绝。
- 模型短期调用经过真实传输并传播取消；发送返回连接丢失时只查询原请求，无自动重发。
- 预览停止覆盖独立后台，释放未知拒绝清理；离线资料维护复用持有锁，连接迁移保留目标会话、附件和交接材料，来源只读。

稳定测试入口沿用现有 `agent-unit`、`agent-integration`、Buildr 集成检查和 `e2e-app-process`；新增子进程测试和网页主程序场景进入既有发现集合，`verification.yml` 的现有服务、路径和四类证明范围足以覆盖，无需新增测试族。正式结果以本任务当前审查与验证报告为准，本文不替代运行日志。

## 首次迁移与未验证范围

旧同进程版本缺少原子暂停接收契约（Contract），不能仅凭磁盘空闲观察自动关闭并迁移活动工作。发现既有资料仍由旧主程序持有时返回 `agent_legacy_upgrade_requires_exit`，保留旧实例；先完成或准确停止旧工作并退出旧版，再启用独立后台。后续版本采用本轮实现的空闲交接。

真实厂家账号、付费模型，以及 Windows、Linux 的原生平台接入没有执行，A11 不能宣称全部通过；协议夹具只证明适配行为。当前知识（Current Knowledge）已校准，但没有执行其知识页面的浏览器验收。正式自举激活继续交由现有唯一执行器，不在本轮自动运行。

## 2026-10-28 并行更新扩展

[并行更新任务](@task/agent-parallel-updates)在 `codex/agent-parallel-updates` 工作树（Worktree）实现第 9 节，初始基线为 `0514b7be1ad297050f86295447fdcd0ed030da39`。本节说明本次实现机制，不改写上述初始阶段交付事实；具体提交、集成和激活结果以该任务当前结果及真实代码库（Repository）为准，公开发布不属于本次收尾范围。

- `process/server.ts`、`client.ts`、`ownership.ts` 和 `runtime-unit.ts` 显式核对并行兼容，保存逐代次实例及唯一当前入口。配置维护完成后移交唯一维护权，旧后台继续准确原轮控制与保存，活跃外代次不会被异常恢复接管。单次模型取消仍交回原后台。
- `persistence/pending-send-repository.ts` 在独立私有资料库保存对话内一条待发送指令，修改、取消和调度认领通过真实事务（Transaction）及修订竞争。稳定请求和已取消、已交付记录用于核对返回丢失；普通草稿不会进入调度。首次升级的兼容接入端可保存同一记录，旧二进制仍按受保护空闲交接。
- `process/pending-sends.ts` 在当前接收后台自动接续，先查原请求，再核对该对话释放、宿主事实和最新交接。每段对话的状态未知只延后自身；选择失效保留内容及原因，不自动改模型或权限。
- `ConversationPanel.tsx` 和 `ConversationPendingSend.tsx` 沿用当前对话输入与选择控件。提交后显示等待，可修改取消，刷新继续读取后台保存的状态；后台开始执行时撤下等待展示，界面不额外派发一次。
- `process/cleanup.ts` 仅在准确旧进程实际退出、释放确认且没有保留引用后删除运行文件和对应实例记录。预览停止检查全部代次，离线维护保留未知工具及未确认释放。

必要检查沿用现有静态检查（Static Check）、单元测试（Unit Test）、集成测试（Integration Test）和生产托管端到端测试（End-to-End Test，E2E）入口；逐项实际结果由本任务当前验证报告保存。新增覆盖包括真实双版子进程、两段旧对话分别释放、原轮停止及审批、待发送跨主程序重启、修订取消竞争、旧接入端重连采用新版、异常局部等待及实际退出清理。真实厂家账号、付费模型和 Windows、Linux 原生平台缺口继续保留，协议替身不构成这些证据。

### 当前知识影响

已校准随包发现指引 `services/buildr/resources/runtime/skills/buildr/references/agent-operations.md`。以下六篇现有材料仍保留初始交付说明，已经核对受影响表达；本次没有扩展到架构知识维护，后续应在获授权时按最终集成版本统一校准，不宣称已更新。

| 现有材料 | 需要校准的表达 |
|---|---|
| `knowledge/docs/architecture/agent-integration.md` | 单后台空闲切换、执行忙碌只保留草稿，改为兼容并行与待发送接续 |
| `knowledge/docs/architecture/agent-boundaries.md` | 共享配置唯一维护者与逐轮执行持有者的区别 |
| `knowledge/docs/architecture/agent-integration-generation.md` | 原后台模型调用与取消、只读账号观察及准确来源身份 |
| `knowledge/docs/architecture/technical.md` | 当前入口、多代次保留和旧后台实际退出清理 |
| `knowledge/code-map/technical-layers.md` | 实例发现、待发送持久化与调度、清理模块的实际职责 |
| `knowledge/code-map/system-services-assets.md` | 私有包及既有对话界面的新增文件与公开操作归属 |
