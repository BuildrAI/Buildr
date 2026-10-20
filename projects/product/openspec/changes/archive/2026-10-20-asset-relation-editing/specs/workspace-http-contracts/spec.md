# workspace-http-contracts Delta Spec

## ADDED Requirements

### Requirement: 目录写入操作接受关系字段
`POST /api/v1/asset-catalog/services` 的服务草稿 MUST 接受可选 `projectIds`（编码或标识集合）；`POST /api/v1/asset-catalog/repositories` 与 `PUT /api/v1/asset-catalog/:kind/:id` MUST 接受可选 `serviceIds`；服务更新 MUST 接受可选 `code` 与 `projectIds`，项目更新 MUST 接受可选 `code`、`serviceIds` 与 `newServices`（服务草稿数组，仅项目更新有效）。全部字段为可选补充，缺失时行为与既有契约一致；未知字段、错误类型或引用不存在的对象 MUST 按既有拒绝语义处理。

#### Scenario: 新增字段随草稿提交
- **WHEN** 客户端提交携带 `serviceIds` 的代码库创建请求
- **THEN** 请求通过契约校验并由应用写入服务引用，未知字段仍被拒绝

#### Scenario: 引用不存在对象
- **WHEN** 任一关系字段引用不存在的标识
- **THEN** 请求被拒绝且不产生部分写入
