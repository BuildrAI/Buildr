## MODIFIED Requirements

### Requirement: 执行可靠性实现只服务真实声明能力
Runner MUST 继续使用受管 Workspace Node、Environment allowed roots、进程 descendant 有界收敛、单次 transient cleanup 与被实际 capability claim 的资源协调。Project declaration execution MUST NOT 新建通用 DAG、dependency、supersedes、scheduler 或资源平台语义。对同一 coordinated resource 的有效 waiter，coordinator MUST 按确定的先到顺序授予可用容量，并 MUST 让取消、timeout、崩溃或过期 waiter 可被精确、有界恢复；新 waiter MUST NOT 越过仍有效的更早 waiter。

#### Scenario: 真实 coordinated capability 并发
- **WHEN** 两个或更多 execution runs 声明并请求同一有限容量 coordinated resource
- **THEN** coordinator MUST 按有效等待顺序授予 slot、绑定 owner/token/expiry 并精确释放
- **AND** 新 waiter MUST NOT 在更早 waiter 仍有效且容量不足时先取得 slot
- **AND** ticket、lease 与等待事实 MUST 只存在于 transient execution evidence

#### Scenario: waiter 取消或过期
- **WHEN** 排队中的 waiter 被取消、达到 timeout、进程崩溃或其 ticket 已过期
- **THEN** coordinator MUST 只清理 token 与 owner 匹配或已可证明过期的 ticket
- **AND** 后续有效 waiter MUST 在有界时间内继续取得可用容量
- **AND** coordinator MUST NOT 删除其他 waiter 或 lease

#### Scenario: flat capability set
- **WHEN** 一个 execution 选择多个互不依赖的 capabilities
- **THEN** runner MAY 有界并发执行
- **AND** declaration 与 Result MUST 不包含 `dependsOn`、`supersedes` 或 DAG status
