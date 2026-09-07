## REMOVED Requirements

### Requirement: Task Environment CLI 必须提供稳定公开 JSON identity
**Reason**: `task environment`CLI及其JSON schema整体删除，不保留兼容输出。

## MODIFIED Requirements

### Requirement: Public JSON registry不得包含退役任务研发与旧收尾schema

Public JSON registry MUST不包含Task Development、旧Task Finish、Task Environment、Environment Plan/Receipt或其他已退役任务流程schema。删除项不得保留兼容alias、example或parity检查。

#### Scenario: fresh build检查JSON catalog
- **WHEN** package/static validation读取公共schema registry
- **THEN** registry MUST只包含仍有公共消费者的Task Record、Review、Verification、Parent、Worktree及其他当前schema
