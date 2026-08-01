## ADDED Requirements

### Requirement: Task Environment 必须提供三个薄公共 CLI action
Buildr CLI MUST 公开 `buildr task environment prepare <task-id>`、`inspect <task-id>` 与 `cleanup <task-id>`，并 MUST 在帮助中将它们描述为 Task Environment Application 的确定性客户端。CLI interface MUST 只拥有参数解析、Application 调用、输出和退出码；Application MUST NOT 解析 argv、打印 stdout/stderr 或修改 process exit state。

#### Scenario: 查看 Task Environment 帮助
- **WHEN** 用户运行 `buildr help task environment` 或任一 action help
- **THEN** 帮助 MUST 展示三个 action、canonical Workspace target、Task ID、effects、授权与停止条件
- **AND** MUST 说明 `prepare` 同时承担首次准备和幂等恢复，Environment Receipt 不属于 Task Record

#### Scenario: 准备或恢复 Task Environment
- **WHEN** 调用方运行 `buildr task environment prepare <task-id>`
- **THEN** CLI MUST 把明确 Task/Workspace input 交给 Application，并返回当前 ready/blocked、实际执行根、关键 probe/effects 与 next action
- **AND** MUST NOT 注册单独 `restore`、接受完整 Receipt/next state 或直接调用 Git worktree provider 形成总结果

#### Scenario: 只读检查 Task Environment
- **WHEN** 调用方运行 `buildr task environment inspect <task-id>`
- **THEN** CLI MUST 只读返回当前机器 Receipt availability、`observedAt`、真实 probe 与 Environment read model
- **AND** MUST NOT 写入 Receipt、准备依赖、创建 checkout、启动/停止资源或执行 cleanup；`observedAt` 只属于本次响应

#### Scenario: 清理 Task Environment
- **WHEN** 调用方运行 `buildr task environment cleanup <task-id>`
- **THEN** CLI MUST 只把已登记的 Finish handoff 或明确 abandon authorization 交给 Application，并返回 removed/retained/blocked 结果
- **AND** MUST NOT 接受任意 shell、删除路径、branch/path ownership 声明或 caller-authored provider result

#### Scenario: 内部资源动作不公开
- **WHEN** 用户检查根帮助、Task Environment topic、command registry 或 public JSON coverage
- **THEN** `resource register/release` MUST NOT 作为公共 CLI action 出现
- **AND** Preview 等已知产品 provider MUST 直接复用 Application，而不是 shell out 或手写 Receipt

### Requirement: Worktree CLI 必须与 Task Environment CLI 分离
Buildr MAY 保留 `buildr worktree create|inspect|cleanup` 作为 Git provider-level 公共命令，但 MUST 只通过 `buildr.git-worktree-result/v1` 返回 Git checkout/branch/HEAD/clean/registration/cleanup evidence。`worktree context|adopt`、session adoption 与 environment-shaped worktree help/JSON MUST 被删除，正式 workflow MUST NOT 以 worktree command result 代替 Task Environment result。

#### Scenario: 用户明确管理 Git worktree
- **WHEN** 用户运行保留的 `worktree create|inspect|cleanup`
- **THEN** CLI MUST 说明该操作只管理 Git provider 事实和精确 Git effects
- **AND** MUST NOT 声称 Runtime/CLI/依赖、ready、恢复、动态资源、session 或总 cleanup authority

#### Scenario: 调用已删除的环境路由
- **WHEN** 调用方运行 `buildr worktree context|adopt` 或旧 environment-shaped action/参数
- **THEN** CLI MUST 作为不存在或不支持的 action 拒绝，并指向 `buildr task environment prepare|inspect`
- **AND** MUST NOT 加载旧 reader/writer、创建 adoption state 或返回旧 Environment result
