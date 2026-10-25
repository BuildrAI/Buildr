## MODIFIED Requirements

### Requirement: 参考流水线必须由真实 HTTP 与正式前端产物验证
Buildr MUST以真实HTTP Contract Test校验参考operation的请求、成功响应和错误响应，并 MUST以本次隔离生成的正式`web-dist`与Task 浏览器端到端检查（E2E）验证typed Client到页面链路。生产成功响应是否运行时重复校验 MUST按局部风险决定，不得替代Contract Test。

#### Scenario: Contract Test 执行参考 operation
- **WHEN** 产品验证运行Task Record HTTP contract capability
- **THEN** 测试 MUST通过真实HTTP host覆盖五个operation的合法与非法输入
- **AND** 真实成功/错误payload MUST通过对应Schema validator

#### Scenario: 正式页面验收
- **WHEN** Buildr Web从正式源码向隔离目标生成`web-dist`并运行Task 浏览器端到端检查（E2E）
- **THEN** Task列表、详情、更新与terminal action的既有用户交互 MUST继续成功
- **AND** 测试 MUST直接消费同一批次生成DTO和Web dist，MUST NOT使用页面专用假DTO或tracked生成物
