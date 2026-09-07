## ADDED Requirements

### Requirement: Task Verification record 冲突必须使用稳定公开 JSON
`buildr task verification record --json` MUST要求调用方提供最近一次 `inspect` 观察到的 `absent|reportDigest`。摘要不匹配时，CLI MUST返回同一 Task Verification operation result family、稳定 conflict diagnostic 与最新 `currentReportDigest`，并 MUST保持 current 报告不变。

#### Scenario: 两个调用方基于同一摘要写入
- **WHEN** 第一个调用方写入成功后第二个调用方提交相同旧摘要
- **THEN** 第二个 JSON 结果 MUST为 blocked 并包含最新 `currentReportDigest`
- **AND** current Verification Report MUST仍是第一个调用方写入的内容

### Requirement: Task Record JSON 必须局部表达引用可用性
Task Record inspect、detail 和 list JSON MUST始终返回结构有效的 Task Record，并以响应级 `referenceDiagnostics` 局部表达当前 Project、Service 或 Change 不可用。诊断 MUST包含 Task 与引用 identity，MUST不写回 Task Record，也不得形成统一健康状态。

#### Scenario: 历史引用不可用
- **WHEN** Task Record 内一个 Project、Service 或 Change 当前不存在、已迁移或暂时不可解析
- **THEN** CLI 与 Buildr Web JSON MUST返回完整顶层 Task Record 和对应局部诊断
- **AND** 其他引用、Parent/Child、状态与结果 MUST保持可读

## REMOVED Requirements

### Requirement: Verification run 必须提供稳定公开 JSON identity
**Reason**: 通用 `buildr verification run` 和 Task Execution Record 产品入口已退役；Agent 直接调用项目测试工具，Task Verification 只保存最终报告。

**Migration**: 使用 Project 测试地图选择真实命令，并通过 `task verification inspect|record` 读取或保存报告。

#### Scenario: 请求旧 verification run JSON
- **WHEN** caller 调用已退役 `buildr verification run --json`
- **THEN** CLI MUST返回标准 unknown command
- **AND** MUST不创建执行记录、报告或资源状态

### Requirement: ExecRecord GC CLI 必须提供稳定公共 JSON
**Reason**: Execution Record 表、正文与 GC Application 已整体删除。

**Migration**: 不提供替代 GC；各真实资源由具体 owner 清理。

#### Scenario: 请求旧 GC 命令
- **WHEN** caller 调用 `task execution-record gc`
- **THEN** CLI MUST返回标准 unknown command
- **AND** MUST保持 Workspace 数据不变

### Requirement: Execution record CLI readback 必须提供closed portable JSON
**Reason**: Execution Record list、inspect 与正文读取能力已退役。

**Migration**: Task 顶层事实使用 Task Record；Review 和 Verification 分别使用所属 inspect。

#### Scenario: 请求旧 readback
- **WHEN** caller 调用 Execution Record list 或 inspect
- **THEN** CLI MUST返回标准 unknown command
- **AND** MUST不提供兼容 alias 或聚合视图

### Requirement: Verification active duplicate 必须返回非执行JSON结果
**Reason**: 该要求依赖已退役 verification runner 与 active Execution Record。

**Migration**: Task Verification current 的并发更新改用调用方观察摘要和事务内冲突诊断。

#### Scenario: 并发写 Verification current
- **WHEN** 多个调用方尝试替换同一 current 报告
- **THEN** MUST使用 Task Verification current digest 契约
- **AND** MUST不创建 run、retry 或 Execution Record
