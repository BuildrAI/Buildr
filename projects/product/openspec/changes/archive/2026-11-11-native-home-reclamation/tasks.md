# 1. 候选与引用证明

- [x] 1.1 `storage/files.ts` 增加 `native-session` 候选类型与受控批量删除（文件或目录、无小文件上限、节点上限 64、共享占用观察、失败恢复）。
- [x] 1.2 新增 `storage/native-sessions.ts`：枚举 Codex rollout 文件与 DSH 会话目录，按稳定窗口、占用、引用生成逐项理由。
- [x] 1.3 `persistence/conversation-repository.ts` 增加只读的全部对话头引用与全部原生工具内容引用；不可读时返回不完整。
- [x] 1.4 新增 `application/native-session-references.ts`：汇总对话头、v3/旧编码工具引用与交接索引，解析绑定，标记未解析与缺上下文提供者。

# 2. 维护门禁与执行

- [x] 2.1 `inspectAgentStorage` 增加默认关闭的原生会话选项；周期 worker 永不启用。
- [x] 2.2 `collectAgentStorage` 增加显式确认选项；未确认时逐项保留并报告 `native_session_confirmation_required`。
- [x] 2.3 确认执行时重新观察引用、加锁、按批（≤256）删除，逐项报告可回收、引用保留、变化保留与批次延后原因。

# 3. 运维入口与文档

- [x] 3.1 新增 `tools/maintenance/native-sessions.ts`：默认 dry-run 输出 JSON 收据，`--confirm` 才执行，支持数据根、数量上限与回执文件。
- [x] 3.2 校准 `services/buildr/resources/runtime/skills/buildr/references/agent-operations.md` 中维护边界与入口说明。

# 4. 验证

- [x] 4.1 新增集成测试：无引用可回收、引用保留、dry-run/未确认保留、确认删除且保全账号配置、旧 v2-zstd 与交接索引引用保留、损坏索引保留、未解析绑定保留、活动占用保留、计划后身份漂移保留。
- [x] 4.2 运行 `npm run typecheck`、相关集成检查与静态检查。
- [x] 4.3 对真实开发 profile 运行 dry-run，汇报候选规模与保留原因，取得显式确认后才执行实际删除。
