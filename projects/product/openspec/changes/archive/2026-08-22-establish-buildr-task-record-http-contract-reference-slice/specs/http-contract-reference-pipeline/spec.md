## ADDED Requirements

### Requirement: HTTP 模块必须拥有可执行的 JSON Schema 契约
Buildr HTTP capability owner MUST 以 Draft 2020-12 JSON Schema 定义本模块已迁移 operation 的请求、成功响应与错误响应，并 MUST 为 Schema 与 operation 提供稳定 identity。Infrastructure MUST只拥有通用注册/编译机制，不得成为业务字段语义 authority。

#### Scenario: Task 模块登记参考 operation
- **WHEN** Task HTTP 模块加载 list、detail、update、complete、abandon 参考切片
- **THEN** 每个 operation MUST 关联稳定 method、path template、request Schema、success Schema 与 error Schema
- **AND** Task 字段语义 MUST 位于 Task HTTP Interfaces，而不是 `public-json.mjs` 或全局业务 Schema 仓库

#### Scenario: 其他 HTTP operation 尚未迁移
- **WHEN** Buildr 仍存在不在参考 catalog 中的 HTTP route
- **THEN** 产品 MAY 输出有界 coverage diagnostic
- **AND** 未迁移事实 MUST NOT 单独阻止 Buildr 启动、构建、Task 开发或发布

### Requirement: 服务端请求校验必须严格且不变异
Buildr MUST 在模块加载或注册时用 Ajv Draft 2020-12 严格编译已登记请求 Schema 并复用 validator。校验 MUST拒绝未知、缺失或非法字段，MUST NOT自动转换类型、填充默认值或删除字段。

#### Scenario: 合法 DTO 通过校验
- **WHEN** 请求 DTO 满足对应 operation Schema
- **THEN** Interface MUST 将原值无变异地交给显式 Application mapping
- **AND** 单次请求 MUST复用已编译 validator 而不是重新编译 Schema

#### Scenario: 非法 DTO 被拒绝
- **WHEN** DTO 包含未知字段、缺少必填字段或字段类型/枚举不合法
- **THEN** HTTP Interface MUST在调用 Application writer 前返回稳定错误 envelope
- **AND** validator MUST NOT通过转换、默认值或字段删除使请求变为合法

#### Scenario: Schema 编译失败
- **WHEN** 已登记 Schema 不满足 strict Draft 2020-12 编译要求或 identity 冲突
- **THEN** 对应模块注册/启动 MUST失败并指出 contract identity
- **AND** 失败 MUST NOT延迟到首个请求才暴露

### Requirement: DTO 生成物必须来自同一 Schema authority
Buildr MUST 从已登记 Schema 在构建期确定性生成后端与 Buildr Web TypeScript DTO，并 MUST提供 tracked 生成物 drift check。生成物 MUST是投影而不是可独立手改的第二 authority；Buildr Web MUST NOT安装或运行 Ajv。

#### Scenario: Schema 生成 DTO
- **WHEN** 维护者显式运行 contract generation
- **THEN** 后端与前端 generated DTO MUST由同一当前 Schema 生成
- **AND** 相同输入与固定工具版本 MUST产生相同字节

#### Scenario: tracked DTO 漂移
- **WHEN** Schema 已变化但任一 tracked generated DTO 尚未更新，或生成物被手工修改
- **THEN** drift check MUST失败并指出漂移文件
- **AND** typecheck/正式 Web build 的参考切片门禁 MUST在交付前暴露该漂移

### Requirement: 业务前端必须通过能力级 typed Client 消费契约
Buildr Web MUST保留通用 fetch/session transport，并 MUST由 Task 能力级 client 使用生成 DTO 暴露 list、detail、update、complete、abandon typed operations。Task 页面 MUST NOT为这些响应维护平行 DTO 或在业务调用点猜测 `unknown` payload。

#### Scenario: 页面读取和修改 Task
- **WHEN** Task 列表或详情页发起参考 operation
- **THEN** 页面 MUST通过 Task typed Client 取得生成 DTO 类型的结果
- **AND** 页面状态与 ViewModel MAY保持局部，但 MUST NOT通过大量 `as` 断言重建 HTTP response shape

### Requirement: 参考流水线必须由真实 HTTP 与正式前端产物验证
Buildr MUST以真实 HTTP Contract Test 校验参考 operation 的请求、成功响应和错误响应，并 MUST以正式 `web-dist` build 与 Task Browser Smoke 验证 typed Client 到页面链路。生产成功响应是否运行时重复校验 MUST按局部风险决定，不得替代 Contract Test。

#### Scenario: Contract Test 执行参考 operation
- **WHEN** 产品验证运行 Task Record HTTP contract capability
- **THEN** 测试 MUST通过真实 HTTP host 覆盖五个 operation 的合法与非法输入
- **AND** 真实成功/错误 payload MUST通过对应 Schema validator

#### Scenario: 正式页面验收
- **WHEN** Buildr Web 从正式源码生成 tracked `web-dist` 并运行 Task Browser Smoke
- **THEN** Task 列表、详情、更新与 terminal action 的既有用户交互 MUST继续成功
- **AND** 测试 MUST NOT使用页面专用假 DTO 绕过生成类型或 typed Client
