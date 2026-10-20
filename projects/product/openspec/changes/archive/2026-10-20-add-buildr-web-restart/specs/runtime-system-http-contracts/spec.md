## MODIFIED Requirements

### Requirement: Buildr Web host operation 必须保持安全与生命周期语义
Buildr MUST 为 health、session quit、session restart 和 instance-secret quit 建立可执行契约，并 MUST 保持现有 Origin/session、instance secret、closing precedence、状态码、响应先于 shutdown 或接管动作和跨进程实例兼容语义。请求校验 MUST 不转换类型、不填默认值、不删除字段，且未知字段 MUST 获得稳定错误 envelope。

#### Scenario: 授权的页面请求退出 Buildr Web
- **WHEN** 当前 session 以合法 Origin、token 和闭合空请求调用 `/api/v1/app/quit`
- **THEN** Buildr MUST 返回 `202` 与符合 Schema 的 stopping DTO
- **AND** MUST 在响应建立后仅调用一次既有 shutdown Application port

#### Scenario: 非法 quit 请求没有副作用
- **WHEN** quit 请求缺少授权、携带未知字段或使用非法类型
- **THEN** Buildr MUST 返回符合统一 error Schema 的稳定拒绝结果
- **AND** shutdown Application port MUST NOT 被调用

#### Scenario: 授权的页面请求重启 Buildr Web
- **WHEN** 当前 session 以合法 Origin、token 和闭合空请求调用 `/api/v1/app/restart`
- **THEN** Buildr MUST 返回 `202` 与符合 Schema 的 restarting DTO
- **AND** MUST 在响应建立后仅调用一次 restart Application port，由该 port 启动同身份后继接管

#### Scenario: 非法 restart 请求没有副作用
- **WHEN** restart 请求缺少授权、携带未知字段或使用非法类型
- **THEN** Buildr MUST 返回符合统一 error Schema 的稳定拒绝结果
- **AND** restart Application port MUST NOT 被调用，实例 MUST 继续运行

#### Scenario: Preview 实例拒绝重启
- **WHEN** 当前 session 对 Preview 实例调用 `/api/v1/app/restart`
- **THEN** Buildr MUST 返回符合统一 error Schema 的稳定拒绝结果
- **AND** MUST NOT 启动后继进程，Preview 实例 MUST 继续运行

#### Scenario: 受信实例探针读取 health
- **WHEN** Launcher、Doctor 或 instance lifecycle 使用正确 instance secret 请求 `/api/v1/health`
- **THEN** Buildr MUST 返回符合版本化 health Schema 的当前 status、pid 与适用 identity/profile
- **AND** 错误 secret MUST 保持 `instance_forbidden` 且不得泄露 health identity

#### Scenario: 受信内部调用退出指定实例
- **WHEN** 内部 lifecycle 以正确 instance secret 和现有无 body 调用 `/api/v1/app/quit-instance`
- **THEN** Buildr MUST 保持该调用兼容并返回 `202` stopping DTO
- **AND** 未授权请求 MUST NOT 触发 shutdown
