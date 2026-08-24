## ADDED Requirements

### Requirement: Runtime/System HTTP Schema 必须由所属 Interface 拥有
Buildr MUST 让 Local App host、System Installation 和 System Publication 的 HTTP Interface 分别拥有自身 Draft 2020-12 request、JSON success 与 error Schema、稳定 `$id` 和 operation metadata；Infrastructure Contracts MUST 只提供通用编译、校验、identity 和生成机制，Bootstrap/Web host MUST 只组合模块公开 catalog。

#### Scenario: 编译并组合 Runtime/System contracts
- **WHEN** Buildr Service 启动或契约测试装配 Runtime/System HTTP contributions
- **THEN** 每个 JSON operation 的 Schema MUST 在模块注册阶段严格编译并复用
- **AND** 具体业务字段 MUST NOT 被复制到 `public-json.mjs` 或全局业务 Schema 仓库

### Requirement: Local App host operation 必须保持安全与生命周期语义
Buildr MUST 为 health、session quit 和 instance-secret quit 建立可执行契约，并 MUST 保持现有 Origin/session、instance secret、closing precedence、状态码、响应先于 shutdown 和跨进程实例兼容语义。请求校验 MUST 不转换类型、不填默认值、不删除字段，且未知字段 MUST 获得稳定错误 envelope。

#### Scenario: 授权的页面请求退出 Local App
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

### Requirement: Installation 与 Publication JSON operation 必须形成完整契约链路
Buildr MUST 为 release-awareness、Publication list 和 Publication detail 提供稳定 operation、严格 request/response/error Schema、显式 Interface DTO 到 Application 的映射、生成 DTO 和真实 HTTP Contract Test；既有路径、status、错误 envelope 与 Application ownership MUST 保持不变。

#### Scenario: 页面读取 release awareness
- **WHEN** Buildr Web 请求 `/api/v1/release-awareness`
- **THEN** System Installation HTTP Interface MUST 返回符合生成 DTO 的版本、track 与更新状态
- **AND** 页面 MUST 通过 Runtime/System typed Client 消费该 DTO而非手写响应断言

#### Scenario: 页面读取 Publication list 与 detail
- **WHEN** Buildr Web 请求已登记 Workspace 的 Publication list 或 detail
- **THEN** System Publication HTTP Interface MUST 校验 route input并返回符合对应 success Schema 的 DTO
- **AND** Articles 页面 MUST 通过 typed Client 消费生成 DTO

### Requirement: Binary Publication asset 必须作为非 JSON operation 显式治理
Buildr MUST 将 Publication asset 下载登记为 `binary` response operation，校验 publication id 与 asset path 输入并保持 MIME、文件读取和路径安全语义；该 operation MUST 有统一 JSON error Schema 和真实 HTTP Contract Test，但 MUST NOT 伪造 success JSON Schema 或 JSON DTO。

#### Scenario: 下载合法 Publication asset
- **WHEN** 用户请求存在且允许读取的 Publication asset
- **THEN** Buildr MUST 返回原 binary bytes 与既有 content type
- **AND** 全局 operation coverage MUST 将该 operation 记为已治理的 binary contract

#### Scenario: 拒绝非法 asset path
- **WHEN** asset path 无效、逃逸 publication root 或目标不存在
- **THEN** Buildr MUST 返回符合统一 error Schema 的稳定错误
- **AND** MUST NOT 读取或暴露允许根之外的文件

### Requirement: 全局 HTTP operation coverage 必须有闭合 disposition
Buildr MUST 从实际 Local App route inventory 与模块公开 operation catalog 形成确定性 coverage，且每个 operation MUST 唯一归类为 `migrated-json`、`migrated-binary`、`deferred` 或 `not-applicable`；`deferred` 和 `not-applicable` MUST 包含 owner 与理由。未知、重复或无 owner operation MUST 使正式 contract/drift check 失败，但 MUST NOT 阻止 Local App runtime 启动或安全只读工作。

#### Scenario: 当前 HTTP surface 完整闭合
- **WHEN** contract check 对 Task、Workspace、Agent Assets 与 Runtime/System route inventory 执行 coverage
- **THEN** 每个实际 operation MUST 恰好存在一个带 owner 的 disposition
- **AND** Doctor、Launcher CLI 和非 HTTP release workflow MUST 以 not-applicable 事实保留现有 owner，而不是被强制改造成 HTTP API

#### Scenario: 新 route 未登记
- **WHEN** 实现新增 HTTP operation 而未增加 Schema/binary contract 或明确 deferred disposition
- **THEN** 正式 contract/drift check MUST 非零失败并报告 route、owner 缺口和修复方向
- **AND** runtime router MUST 不依赖该离线检查才能启动

### Requirement: 生成 DTO 与发布形态必须保持一致
Buildr MUST 从同一 Runtime/System Schema 在构建期确定性生成后端与 Buildr Web DTO，并 MUST 通过 drift check、Buildr Service typecheck/Contract/System tests、Buildr Web typecheck/正式 build、tracked `web-dist`、Application Payload、npm tarball parity 与 Browser Smoke 验证一致性。Buildr Web MUST NOT 引入 Ajv runtime，非 Web CLI 冷启动 MUST NOT 依赖 DTO generator。

#### Scenario: Schema 与生成物发生漂移
- **WHEN** Runtime/System Schema 改变但任一 tracked DTO 或 `web-dist` 未刷新
- **THEN** 对应 drift/build check MUST 非零失败并报告 source `$id` 与漂移目标

#### Scenario: 正式发布入口验收
- **WHEN** P2 形成稳定 Content Target 并执行正式 Candidate 验证
- **THEN** development checkout、Application Payload、npm tarball 与 tracked Buildr Web MUST 对相同 Runtime/System HTTP contract 表现一致
- **AND** Browser Smoke MUST 覆盖 release-awareness、Publication 与安全退出的代表性用户链路
