## ADDED Requirements

### Requirement: 产品验证必须覆盖 Environment authority 与清理
Buildr product verification MUST 覆盖 Task Record gate、共享执行根、单/多 repo Git provider、Runtime/CLI/依赖准备、runtime projection、Task-scoped Change 解析、Local App Environment inspect、资源登记、串行恢复、Finish cleanup handoff与明确放弃，并 MUST 证明所有正式 consumer 只读写 Workspace SQLite Environment current authority。

#### Scenario: checkout 与 npm package 正常路径
- **WHEN** verifier 分别从 checkout 和 npm tarball 初始化临时 Workspace 并执行正式 Task 环境流程
- **THEN** 两者 MUST 产生等价的 Task Environment contract/result、SQLite current row、provider evidence 与 ready/cleanup 语义
- **AND** 只允许 machine path、时间、进程和下载缓存等真实本机事实不同

#### Scenario: Buildr 自举依赖准备
- **WHEN** 干净 task checkout 没有 `node_modules` 且候选 CLI probe 失败
- **THEN** retained stable controller MUST 使用 Workspace Node/npm 与 checkout 自己的 lockfile 完成 `npm ci` 后重新 probe
- **AND** verifier MUST 证明 retained/peer `node_modules` 未被复用、链接或修改

#### Scenario: 动态资源登记失败
- **WHEN** preview/dev server 已启动但 Environment writer 拒绝登记
- **THEN** creator MUST 停止刚创建的 owned process/resource 并返回失败
- **AND** current row、其他 previews、默认 Local App 与其他任务 MUST 保持不受影响

#### Scenario: Task-scoped Change 与 Local App Environment
- **WHEN** Change 只存在于 matching Task Environment Project root，且用户打开该 Task 详情
- **THEN** Task Record reference 与 task-scoped Change detail MUST 返回 candidate provenance，环境页签 MUST 通过 Application `inspect` 返回当前机器的有界 probe
- **AND** 全局 Change list MUST 保持 retained-only，Web/HTTP MUST 不直接读取 Receipt store 或接受任意 filesystem path

#### Scenario: 正常 Finish 与放弃 cleanup
- **WHEN** fixture 分别提供已交付 normal handoff、明确 abandon authorization 和 ownership 不明 shared root
- **THEN** Environment MUST 分别完成安全清理、清理可证明的 Task-owned dirty 资源、对不明 shared content 返回 blocked/retained
- **AND** Task Finish MUST 不直接调用 worktree cleanup、重复交付或写第二份 cleanup 结论

#### Scenario: 防止文件 authority 回退
- **WHEN** package/static/runtime verification 发现旧 environment writer、文件 importer、`worktree context/adopt` guidance、adoption receipt、environment-shaped worktree JSON/help 或 consumer direct edge 任一仍可达
- **THEN** verification MUST 失败并报告具体冲突入口
- **AND** legacy identity 只 MAY 出现在 OpenSpec archive/history，Buildr runtime、sync 与 package tests MUST NOT保留迁移 reader

## REMOVED Requirements

### Requirement: 产品验证必须覆盖 Environment authority 迁移与清理
**Reason**: 一次性 Environment authority migration 已从当前产品退出，验证不再维护 legacy migration fixtures。

**Migration**: 使用新的“产品验证必须覆盖 Environment authority 与清理”Requirement 覆盖 SQLite current、恢复、资源与 cleanup 正常路径。
