# http-contract-reference-pipeline Specification

## Purpose

定义模块自有 JSON Schema、严格 Ajv 校验、确定性 DTO 生成、typed Client 与局部漂移检查的参考流水线和扩展边界。

## Requirements

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
Buildr MUST从已登记Schema在构建前确定性生成后端与Buildr Web TypeScript DTO，并 MUST让generator接受显式输出目标。开发输出 MUST位于精确ignored generated目录，正式构建 MUST绑定同一生成批次manifest；生成物 MUST是投影而不是可独立手改的第二authority，MUST不进入Git tracked tree，Buildr Web MUST NOT安装或运行Ajv。

#### Scenario: Schema 生成 DTO
- **WHEN** 维护者在不含DTO生成物的干净checkout运行contract generation或消费方build
- **THEN** 后端与前端generated DTO MUST由同一当前Schema生成并进入各自ignored目标
- **AND** 相同输入与固定工具版本向两个新目标生成 MUST产生相同bytes

#### Scenario: tracked DTO 漂移
- **WHEN** typecheck或正式Web build开始时本地DTO不存在或来自旧Schema
- **THEN** 声明入口 MUST先重新生成并校验当前DTO，再运行消费者检查
- **AND** 生成失败、输出不闭合或consumer compile失败 MUST返回非零并指出Schema family与目标

### Requirement: 业务前端必须通过能力级 typed Client 消费契约
Buildr Web MUST保留通用 fetch/session transport，并 MUST由 Task 能力级 client 使用生成 DTO 暴露 list、detail、update、complete、abandon typed operations。Task 页面 MUST NOT为这些响应维护平行 DTO 或在业务调用点猜测 `unknown` payload。

#### Scenario: 页面读取和修改 Task
- **WHEN** Task 列表或详情页发起参考 operation
- **THEN** 页面 MUST通过 Task typed Client 取得生成 DTO 类型的结果
- **AND** 页面状态与 ViewModel MAY保持局部，但 MUST NOT通过大量 `as` 断言重建 HTTP response shape

### Requirement: 参考流水线必须由真实 HTTP 与正式前端产物验证
Buildr MUST以真实HTTP Contract Test校验参考operation的请求、成功响应和错误响应，并 MUST以本次隔离生成的正式`web-dist`与Task Browser Smoke验证typed Client到页面链路。生产成功响应是否运行时重复校验 MUST按局部风险决定，不得替代Contract Test。

#### Scenario: Contract Test 执行参考 operation
- **WHEN** 产品验证运行Task Record HTTP contract capability
- **THEN** 测试 MUST通过真实HTTP host覆盖五个operation的合法与非法输入
- **AND** 真实成功/错误payload MUST通过对应Schema validator

#### Scenario: 正式页面验收
- **WHEN** Buildr Web从正式源码向隔离目标生成`web-dist`并运行Task Browser Smoke
- **THEN** Task列表、详情、更新与terminal action的既有用户交互 MUST继续成功
- **AND** 测试 MUST直接消费同一批次生成DTO和Web dist，MUST NOT使用页面专用假DTO或tracked生成物
