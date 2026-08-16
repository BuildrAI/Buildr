## MODIFIED Requirements

### Requirement: 执行可靠性实现只服务真实声明能力
Runner MUST 继续使用Environment allowed roots、进程 descendant 有界收敛、单次 transient cleanup 与被实际 capability claim 的资源协调，并 MUST按capability声明argv与当前受控执行环境运行。Project declaration execution MUST NOT 新建通用 runtime resolver、DAG、dependency、supersedes、scheduler 或资源平台语义。对同一 coordinated resource 的有效 waiter，coordinator MUST 按确定的先到顺序授予可用容量，并 MUST 让取消、timeout、崩溃或过期 waiter 可被精确、有界恢复；新 waiter MUST NOT 越过仍有效的更早 waiter。

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

### Requirement: 正式 Verification execution 必须先取得持久化容量
Formal Task command runner MUST在调用前语义校验完成后、任何producer execution启动前调用Task Execution Record Application open。quota backpressure、Task terminal或record identity冲突 MUST阻止resource waiter、process与target observation启动，并 MUST NOT以先执行后丢弃正文绕过固定reservation。

#### Scenario: Task owner quota不足
- **WHEN** 新record的固定reservation会超过Task/owner或Workspace quota
- **THEN** runner MUST返回空checks、portable backpressure diagnostic与唯一cleanup/resolution next action
- **AND** MUST NOT启动capability、创建transient run目录、写current Result或静默清理其他record

#### Scenario: 调用前请求无效
- **WHEN** Project、declaration、capability、authorization或execution root在open前校验失败
- **THEN** runner MUST返回既有invalid request envelope且execution record为not-opened
- **AND** MUST NOT创建metadata、quota reservation、transient evidence或专业Result
