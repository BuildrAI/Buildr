## ADDED Requirements

### Requirement: System Installation update operation 必须形成完整契约链路

Buildr MUST 为 `POST /api/v1/update/prepare`、`GET /api/v1/update/status` 与 `POST /api/v1/update/apply` 建立稳定 operation、严格 request/response/error Schema、显式 Interface DTO 到 Application 的映射、生成 DTO 和真实 HTTP Contract Test；三个 operation MUST 登记为 `system-installation` 所有的 `migrated-json` disposition 并进入全局 operation coverage。POST 操作 MUST 使用与 `app/*` 相同的 Origin/session 写保护，未授权、未知字段或非法类型的请求 MUST 获得统一 error envelope 且 MUST NOT 产生下载、安装或交接副作用；GET status MUST 为只读。

#### Scenario: 页面发起更新准备与应用

- **WHEN** 当前 session 以合法 Origin、token 调用 update prepare 或 apply
- **THEN** System Installation HTTP Interface MUST 校验闭合请求 Schema 并返回符合 Schema 的任务快照或受理响应
- **AND** 页面 MUST 通过 Runtime/System typed Client 消费生成 DTO 而非手写响应断言

#### Scenario: 非法更新请求没有副作用

- **WHEN** prepare 或 apply 请求缺少授权、携带未知字段或使用非法类型
- **THEN** MUST 返回符合统一 error Schema 的稳定拒绝结果
- **AND** MUST NOT 执行 registry 核对、下载、安装或交接

#### Scenario: 页面只读任务状态

- **WHEN** 页面请求 update status
- **THEN** MUST 返回符合 Schema 的当前任务快照
- **AND** MUST NOT 改变任务状态或产生写入副作用

#### Scenario: Preview 实例拒绝更新写入口

- **WHEN** Preview 实例收到 update prepare 或 apply 请求
- **THEN** MUST 返回稳定的不支持错误且不产生任务副作用
- **AND** GET status 仍 MUST 保持只读可观
