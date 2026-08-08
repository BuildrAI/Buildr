## ADDED Requirements

### Requirement: Package residual gate 必须退役持久化 Task Lifecycle projection
Buildr package、checkout runtime、npm tarball与Workspace投射 MUST交付相同的专业current schema、Task Overview reader与terminal completion reader，并 MUST从latest runtime composition、source、manifest、docs与tests删除Task Lifecycle projection repository/application/writers。历史连续migration `0006_create_task_lifecycle_current.sql` MAY保留为升级链事实，但latest schema与可执行runtime MUST不存在`task_lifecycle_current` table dependency或projection method。

#### Scenario: 静态扫描 current runtime
- **WHEN** package verifier扫描runtime composition、Application/repository imports、Finish executor与专业writers
- **THEN** `registerTaskLifecycleRepository`、`registerTaskLifecycleReadModelApplication`、`read/update/inspect/projectTaskLifecycle*`与Finish lifecycle refresh调用 MUST全部不存在
- **AND** Task、Environment、Development、Review、Verification与Finish writer MUST只更新所属专业authority

#### Scenario: 检查 migration package
- **WHEN** package verifier检查checkout、tarball与初始化Workspace的migration assets
- **THEN** 三种入口 MUST包含完全一致且连续的退役migration，并动态从assets解析latest version
- **AND** verifier MUST NOT通过固定版本号或删除历史`0006`来表达latest schema

#### Scenario: 验证 Overview 与专业 reader parity
- **WHEN** checkout、npm tarball或Local App读取同一Task的Overview、研发、证据、环境与terminal状态
- **THEN** 各入口 MUST从专业current/Finish completion返回等价摘要与缺失/冲突diagnostic
- **AND** GET MUST不创建数据库、应用migration、观察外部事实或写回任一row

#### Scenario: 验证既有用户数据库升级
- **WHEN** package verification从fresh、各旧ledger起点、完整/部分lifecycle与冲突fixture升级到latest
- **THEN** 可安全数据 MUST保留，latest schema MUST没有`task_lifecycle_current`，terminal association不匹配 MUST完整rollback
- **AND** 旧runtime读取升级数据库 MUST返回`database-newer-than-runtime`
