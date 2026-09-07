## MODIFIED Requirements

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
