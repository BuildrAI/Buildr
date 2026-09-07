## MODIFIED Requirements

### Requirement: Worktree CLI 必须与 Task Environment CLI 分离

Buildr MUST只保留`buildr worktree create|inspect|cleanup`作为Git位置和删除安全公共命令。CLI MUST NOT提供`task environment`、Plan、Receipt、ready、恢复、资源登记或总cleanup动作。

#### Scenario: 用户明确管理 Git worktree
- **WHEN** 用户运行`worktree create|inspect|cleanup`
- **THEN** CLI MUST只返回`buildr.git-worktree-result/v1`
- **AND** MUST NOT要求或生成Task Environment记录

#### Scenario: 调用已删除的环境路由
- **WHEN** 调用方运行`task environment *`、`worktree context|adopt`或旧Environment参数
- **THEN** CLI MUST作为不存在或不支持的命令拒绝

## REMOVED Requirements

### Requirement: Task Environment 必须提供 Plan 与 Environment 薄公共 CLI actions
**Reason**: 统一Task Environment、Plan和Receipt已删除。

### Requirement: Task Environment no-change cleanup 资格必须由Application派生
**Reason**: 清理由具体资源owner和Worktree分别保护，不再存在总cleanup Application。
