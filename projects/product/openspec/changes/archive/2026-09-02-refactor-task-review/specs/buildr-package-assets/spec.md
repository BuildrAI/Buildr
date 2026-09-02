## MODIFIED Requirements

### Requirement: Package 必须原子交付 Task Review authority
Buildr package MUST原子交付`buildr.task-review/v2` contract、默认Skill、TypeScript Domain/Application/Repository/CLI/HTTP、v2 JSON、只读Web API与前端Agent action。package check与doctor MUST校验v1 retirement、v2 binding、Development v4独立契约和全部接口一致性。

#### Scenario: 安装或更新 workspace assets
- **WHEN** package安装、更新或同步workspace
- **THEN** Skills manifest MUST登记`buildr.task-review@2`与`buildr.task-development@4`
- **AND** runtime projection MUST删除v1/v3 contract且不创建类型专属Review provider

#### Scenario: package/runtime parity
- **WHEN** Task Review从source、package checkout或tarball执行
- **THEN** 三者 MUST产生等价v2 Result、CAS、JSON、CLI help与只读Web model

#### Scenario: Task Review 资产不完整
- **WHEN** contract、Skill、binding、Application/CLI、migration、JSON、Web或tests任一缺失
- **THEN** package check/doctor MUST报告blocked且不得描述为ready
