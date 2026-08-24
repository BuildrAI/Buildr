## MODIFIED Requirements

### Requirement: Runtime/System HTTP Schema 必须由所属 Interface 拥有
Buildr MUST 让 Buildr Web host、System Installation 和 System Publication 的 HTTP Interface 分别拥有自身 Draft 2020-12 request、JSON success 与 error Schema、稳定 `$id` 和 operation metadata；Infrastructure Contracts MUST 只提供通用编译、校验、identity 和生成机制，Bootstrap/Web host MUST 只组合模块公开 catalog。

#### Scenario: 编译并组合 Runtime/System contracts
- **WHEN** Buildr Service 启动或契约测试装配 Runtime/System HTTP contributions
- **THEN** 每个 JSON operation 的 Schema MUST 在模块注册阶段严格编译并复用
- **AND** 具体业务字段 MUST NOT 被复制到 `public-json.mjs` 或全局业务 Schema 仓库

### Requirement: Local App host operation 必须保持安全与生命周期语义
Buildr MUST 为 health、session quit 和 instance-secret quit 建立可执行契约，并 MUST 保持现有 Origin/session、instance secret、closing precedence、状态码、响应先于 shutdown 和跨进程实例兼容语义。请求校验 MUST 不转换类型、不填默认值、不删除字段，且未知字段 MUST 获得稳定错误 envelope。

#### Scenario: 授权的页面请求退出 Buildr Web
- **WHEN** 当前 session 以合法 Origin、token 和闭合空请求调用 `/api/v1/app/quit`
- **THEN** Buildr MUST 返回 `202` 与符合 Schema 的 stopping DTO
- **AND** MUST 在响应建立后仅调用一次既有 shutdown Application port

#### Scenario: 非法 quit 请求没有副作用
- **WHEN** quit 请求缺少授权、携带未知字段或使用非法类型
- **THEN** Buildr MUST 返回符合统一 error Schema 的稳定拒绝结果
- **AND** shutdown Application port MUST NOT 被调用

#### Scenario: 受信实例探针读取 health
- **WHEN** Launcher、Doctor 或 instance lifecycle 使用正确 instance secret 请求 `/api/v1/health`
- **THEN** Buildr MUST 返回符合版本化 health Schema 的当前 status、pid 与适用 identity/profile
- **AND** 错误 secret MUST 保持 `instance_forbidden` 且不得泄露 health identity

#### Scenario: 受信内部调用退出指定实例
- **WHEN** 内部 lifecycle 以正确 instance secret 和现有无 body 调用 `/api/v1/app/quit-instance`
- **THEN** Buildr MUST 保持该调用兼容并返回 `202` stopping DTO
- **AND** 未授权请求 MUST NOT 触发 shutdown

### Requirement: 全局 HTTP operation coverage 必须有闭合 disposition
Buildr MUST 从实际 Buildr Web route inventory 与模块公开 operation catalog 形成确定性 coverage，且每个 operation MUST 唯一归类为 `migrated-json`、`migrated-binary`、`deferred` 或 `not-applicable`；`deferred` 和 `not-applicable` MUST 包含 owner 与理由。未知、重复或无 owner operation MUST 使正式 contract/drift check 失败，但 MUST NOT 阻止 Buildr Web runtime 启动或安全只读工作。

#### Scenario: 当前 HTTP surface 完整闭合
- **WHEN** contract check 对 Task、Workspace、Agent Assets 与 Runtime/System route inventory 执行 coverage
- **THEN** 每个实际 operation MUST 恰好存在一个带 owner 的 disposition
- **AND** Doctor、Launcher CLI 和非 HTTP release workflow MUST 以 not-applicable 事实保留现有 owner，而不是被强制改造成 HTTP API

#### Scenario: 新 route 未登记
- **WHEN** 实现新增 HTTP operation 而未增加 Schema/binary contract 或明确 deferred disposition
- **THEN** 正式 contract/drift check MUST 非零失败并报告 route、owner 缺口和修复方向
- **AND** runtime router MUST 不依赖该离线检查才能启动

## RENAMED Requirements

- FROM: `### Requirement: Local App host operation 必须保持安全与生命周期语义`
  - TO: `### Requirement: Buildr Web host operation 必须保持安全与生命周期语义`

## RENAMED Scenarios

- REQUIREMENT: `Local App host operation 必须保持安全与生命周期语义`
  - FROM: `授权的页面请求退出 Local App`
  - TO: `授权的页面请求退出 Buildr Web`

