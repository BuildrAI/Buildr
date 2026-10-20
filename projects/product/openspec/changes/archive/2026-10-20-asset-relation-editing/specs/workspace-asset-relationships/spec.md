# workspace-asset-relationships Delta Spec

## ADDED Requirements

### Requirement: 代码库登记维护引用服务
新增与编辑代码库实例（Repository Instance）MUST 可携带 `serviceIds`，把所选服务的 `repositoryId` 安置到该实例。编辑时提交集合 MUST 包含当前已引用该实例的全部服务；把已引用服务移出集合 MUST 被拒绝并提示先在其他代码库安置。服务 MUST NOT 因代码库表单操作失去唯一代码来源；移入服务 MUST 保留其模块路径声明，由目录诊断报告新库内的准备情况。

#### Scenario: 新增代码库同时安置服务
- **WHEN** 用户新增代码库并选择若干服务
- **THEN** 系统在同一版本核对内登记代码库并把所选服务的引用更新为实例标识，服务模块路径保持不变

#### Scenario: 移出当前成员被拒绝
- **WHEN** 编辑代码库时提交的 `serviceIds` 缺少当前已引用服务
- **THEN** 系统 MUST 拒绝本次写入并提示该服务须先安置到其他代码库

### Requirement: 服务与项目编码可编辑
服务（Service）与项目（Project）的稳定编码 MUST 允许经统一目录更新修改，格式与唯一性约束与创建一致；重名或非法格式 MUST 被拒绝且不产生部分写入。项目改码 MUST 同步重写历史定位（legacyRefs）中该项目的前缀，服务改码 MUST NOT 改写既有历史定位；服务改码后 `services/<旧编码>/` 文档目录存在时 MUST 尽力随名迁移，迁移失败不否定登记修改。

#### Scenario: 服务编码重名
- **WHEN** 服务编码修改为已存在的编码
- **THEN** 系统 MUST 拒绝写入并保留原登记

#### Scenario: 项目改码后历史定位仍可解析
- **WHEN** 项目编码由 `pig` 改为 `pigs` 且存在 `pig/api` 历史定位
- **THEN** 该历史定位 MUST 更新为 `pigs/api`，旧项目服务定位继续可解析

### Requirement: 服务登记与编辑维护项目归属
新增服务 MUST 可同时归属多个项目：`projectIds`、`projectCode` 与请求级 `projectId` MUST 合并为最终归属集合并写入各项目 `serviceIds`，未知项目标识或编码 MUST 被拒绝。编辑服务 MUST 可通过 `projectIds` 按全量语义调整归属；编辑项目 MUST 可通过 `serviceIds` 按全量语义调整成员并可在同一提交携带 `newServices` 新建成员，行为与项目服务关联入口一致，解除关联不删除服务。

#### Scenario: 选择代码库时项目归属仍生效
- **WHEN** 新增服务选择已有代码库并携带 `projectCode`
- **THEN** 系统 MUST 完成服务登记并把服务写入该项目成员，项目归属不得因代码库选择被丢弃

#### Scenario: 编辑服务调整项目归属
- **WHEN** 服务编辑提交与当前归属不同的 `projectIds`
- **THEN** 系统 MUST 原子更新相关项目成员集合并为新归属补充历史定位，解除关联不删除服务
