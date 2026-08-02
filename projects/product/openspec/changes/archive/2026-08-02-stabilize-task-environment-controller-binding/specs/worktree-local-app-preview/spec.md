## MODIFIED Requirements

### Requirement: Preview stop 必须绑定 task environment 所有权
对正式 Task 创建的 Local App preview，`app preview stop` MUST 要求并核对 Task ID、canonical Workspace、Environment root、Environment Receipt resource ID、preview provider identity/handle、provider owner 与 secret，并 MUST 仅停止完全匹配的实例。停止成功后 preview provider MUST 通过可信 retained Environment Manager 释放对应 resource；retained manager content identity MUST NOT 成为 ownership 条件，独立 retained Workspace preview MAY 保持既有实例级停止语义。

#### Scenario: 正确 owner 停止 Task Preview
- **WHEN** 调用方提供与 Environment resource/preview metadata 一致的 Task、Workspace、Environment root、resource ID、provider identity/handle，且实例 secret 有效
- **THEN** Buildr MUST 停止 preview、确认进程终止并删除本实例运行状态
- **AND** MUST 通过 Environment `resource release` 更新同一 receipt，并在 JSON 结果记录 provider 与 Environment 两侧 evidence

#### Scenario: retained manager 已升级
- **WHEN** Task Preview owner/resource facts 全部匹配，但当前 clean retained Environment Manager 的 content identity 与 Preview 创建时不同
- **THEN** Preview stop/resource release MUST 继续按 Environment/resource/provider ownership 执行
- **AND** MUST NOT 要求 controller handoff、改写 owner generation 或拒绝旧 owner 中缺少/包含不同 `controllerIdentity`

#### Scenario: 错误 owner 尝试停止 Preview
- **WHEN** 调用方的 Task、Workspace、Environment root、resource ID、provider identity/handle、preview owner 或 secret 任一不匹配
- **THEN** Buildr MUST fail closed 且不得向进程发送停止信号或修改 Environment Receipt
- **AND** 实例 MUST 继续可被真实 owner/Task Environment 检查和停止

#### Scenario: 进程已退出但资源记录仍在
- **WHEN** preview provider 证明目标实例不再健康且 metadata 仍与 Environment resource 匹配
- **THEN** Buildr MUST 只清理本实例陈旧运行状态并释放对应 Environment resource
- **AND** MUST NOT 把没有匹配 receipt 的同名进程或端口当作该 Task 资源

### Requirement: Task Preview 必须登记为 Environment 动态资源
正式 Task 的 Local App Preview MUST 在进程健康后、向调用方报告 start 成功前，通过可信 retained Environment Manager 登记为 Task-owned 动态资源。Environment Receipt MUST 保存 preview instance、Task、canonical Workspace、Environment root、工作范围、Product checkout、URL/port、process/provider identity 和非敏感 cleanup handle；preview store MUST 继续拥有进程 secret 与实例运行细节，MUST NOT 使用 manager content hash 表达资源 ownership。

#### Scenario: 成功启动 Task Preview
- **WHEN** `buildr app preview start <instance>` 已启动健康进程且请求来自 matching `ready` Task Environment
- **THEN** preview manager MUST 调用 Environment `resource register` 并取得 matching resource identity
- **AND** 只有登记成功后才 MUST 返回 start success、URL 与 Environment resource evidence

#### Scenario: Environment 登记失败
- **WHEN** preview 已健康但 Environment Receipt 缺失、owner/scope 不匹配或写入失败
- **THEN** preview manager MUST 立即认证停止刚创建的实例并清理本实例状态
- **AND** MUST 返回 start blocked，且不得影响默认 Local App、其他 preview 或其他 Task receipt

#### Scenario: 恢复 Environment 时发现 Preview
- **WHEN** Task Environment restore 读取已登记 preview resource
- **THEN** Environment MUST 通过 preview provider probe 复核实例 identity 与健康状态
- **AND** MUST 将真实 running/stale/released 事实写入同一 receipt，而不是扫描进程名、端口或比较 controller hash 猜 ownership

#### Scenario: Environment cleanup 停止 Preview
- **WHEN** Task Environment cleanup 处理已登记 preview resource
- **THEN** 它 MUST 先调用 preview provider 认证停止实例，再记录 resource release
- **AND** Git worktree provider cleanup MUST 只在 preview 已停止后继续
