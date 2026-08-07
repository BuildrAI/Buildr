## MODIFIED Requirements

### Requirement: Task lifecycle current read model 必须由生命周期动作维护
Buildr MUST 在 Workspace SQLite 中为每个正式 Task 保存一个 current lifecycle read model。Task Record、Task Environment、Task Development、Task Review、Task Verification 和 Task Finish 的成功生命周期动作 MUST 在专业事实写入成功后更新其对应摘要、状态、identity/digest、observedAt 和最小诊断。Environment lifecycle summary MUST 来源于同一 Application action 已提交的 `task_environment_current` row，不得从 Environment file 回填；它不是 Environment current authority。

#### Scenario: Environment 动作完成
- **WHEN** Task Environment 的 prepare、resource register/release 或 cleanup action 成功写入 `task_environment_current`
- **THEN** lifecycle current read model MUST 同步保存 Environment status、receipt digest、scope/resource/cleanup summary 与 observedAt
- **AND** MUST NOT 把完整 Environment Receipt、secret、resource handle、命令输出或历史事件复制进 projection

#### Scenario: 专业动作失败
- **WHEN** lifecycle action 在校验或专业事实写入阶段失败
- **THEN** MUST NOT 用失败输入覆盖已有 lifecycle current read model 或 Environment current row
- **AND** MUST 返回可诊断失败结果，允许用户从同一生命周期动作重试

### Requirement: lifecycle read model 读取必须是纯 SQLite 查询
Application inspect 和 Local App GET MUST 只读取 Task Record、专业 current records、`task_environment_current` 与 lifecycle current read model。它们 MUST NOT 在读取过程中执行 Git observation、Content Target 扫描、verification declaration 解析、Environment probe、Finish Result 目录扫描、`environment.json` 解析或 projection 回填。

#### Scenario: Local App 读取环境、研发和证据
- **WHEN** 用户打开 Task 的环境、研发或证据页签并请求对应 GET endpoint
- **THEN** API MUST 从已保存 SQLite current/read model 返回最近一次生命周期确认的状态与专业 facts
- **AND** 同一请求 MUST NOT 触发 Git、Environment、任意 Environment file 或 Finish filesystem observation

#### Scenario: Environment current 尚未形成
- **WHEN** Task 有 Task Record 或其他专业 current record 但没有 `task_environment_current` row
- **THEN** Environment inspect MUST 返回稳定的 `unavailable`/no-receipt diagnostic与prepare next action
- **AND** MUST NOT 为了补齐 row 或 lifecycle snapshot 修改数据库、扫描旧 Environment file 或伪造 ready

#### Scenario: lifecycle snapshot 尚未形成
- **WHEN** Task 有专业 current record 但没有 lifecycle current snapshot
- **THEN** inspect MUST 返回稳定的 unknown/unavailable 诊断和已有可读专业事实
- **AND** MUST NOT 为了补齐 snapshot 修改数据库或扫描外部来源

### Requirement: lifecycle snapshot 必须明确观察时间和陈旧边界
Lifecycle read model MUST 为每个非空专业 section 保存 `observedAt` 和 `source`，并 MUST 将其解释为最后一次正式 lifecycle action 确认的快照。外部 Git、文件、Environment 或 provider 在两次动作之间变化时，系统 MUST 等待下一次对应 lifecycle action 更新状态；GET 不得重新探测或从文件重建 Environment 状态。

#### Scenario: Environment 在读取前发生外部变化
- **WHEN** Task-owned resource、Git provider 或其他 Environment 外部事实在最近一次 Environment action 后发生变化
- **THEN** Local App MUST 继续展示最后一次 SQLite current snapshot并标明确认时间
- **AND** MUST NOT 在 GET 请求中将其重新计算为 ready、blocked、stale 或 current
