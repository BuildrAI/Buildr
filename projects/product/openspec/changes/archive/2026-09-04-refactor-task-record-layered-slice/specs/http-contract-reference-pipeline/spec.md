## MODIFIED Requirements

### Requirement: 服务端请求校验必须严格且不变异
Buildr MUST 在模块加载或注册时用 Ajv Draft 2020-12 严格编译已登记请求 Schema 并复用 validator。校验 MUST拒绝未知、缺失或非法字段，MUST NOT自动转换类型、填充默认值或删除字段。同形 HTTP DTO 与 Application DTO MUST直接传递；只有协议结构与用例输入确实不同时，Interface 才 MUST执行局部显式转换。成功与错误响应 MUST通过生成 DTO、严格类型检查和真实 HTTP Contract Test 校验，生产请求链 MUST NOT默认重复运行响应 validator。

#### Scenario: 合法 DTO 通过校验
- **WHEN** 请求 DTO 满足对应 operation Schema 且与 Application DTO 同形
- **THEN** Interface MUST 将原值无变异地交给 Application
- **AND** MUST NOT为同形字段建立复制 mapping
- **AND** 单次请求 MUST复用已编译 validator 而不是重新编译 Schema

#### Scenario: 协议结构与应用输入不同
- **WHEN** CLI 文本参数或未来 HTTP 协议结构与 Application DTO 不同
- **THEN** 对应 Interface MUST在自身边界执行明确转换
- **AND** Application MUST NOT依赖 CLI 或 HTTP implementation

#### Scenario: 非法 DTO 被拒绝
- **WHEN** DTO 包含未知字段、缺少必填字段或字段类型/枚举不合法
- **THEN** HTTP Interface MUST在调用 Application writer 前返回稳定错误 envelope
- **AND** validator MUST NOT通过转换、默认值或字段删除使请求变为合法

#### Scenario: Schema 编译失败
- **WHEN** 已登记 Schema 不满足 strict Draft 2020-12 编译要求或 identity 冲突
- **THEN** 对应模块注册/启动 MUST失败并指出 contract identity
- **AND** 失败 MUST NOT延迟到首个请求才暴露

#### Scenario: HTTP 返回成功或错误响应
- **WHEN** 真实 HTTP Contract Test 调用已登记 Task Record operation
- **THEN** 成功与错误 payload MUST通过对应 Schema validator
- **AND** 生产响应是否校验 MUST NOT成为页面数据有效性或 mutation 正确性的第二 authority
