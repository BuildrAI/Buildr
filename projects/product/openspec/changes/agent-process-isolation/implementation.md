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
