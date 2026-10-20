## MODIFIED Requirements

### Requirement: 服务与项目编码可编辑
服务（Service）与项目（Project）的稳定编码 MUST 允许经统一目录更新修改，格式与唯一性约束与创建一致；重名或非法格式 MUST 被拒绝且不产生部分写入。项目改码 MUST 同步重写历史定位（legacyRefs）中该项目的前缀，服务改码 MUST NOT 改写既有历史定位。对于受管项目目录 `projects/<编码>/` 与服务文档目录 `services/<编码>/`，改码目标路径已存在时 MUST 拒绝整个更新，不得静默采用、覆盖或合并目标内容；适用的目录移动与清单更新 MUST 在同一可恢复事务中完成。项目受管目录移动时，其下已登记代码库的 `source.path` 前缀 MUST 在同一事务中更新；若服务代码库根位于项目目录上层，指向被移动目录的服务 `modulePath` 前缀 MUST 同步更新，使代码位置保持不变。代码库身份与 Git 声明保持不变；随项目移动的嵌套代码库的 `modulePath` 保持不变。附接项目（attached source）的实际源位置 MUST 在项目改码时保持不变。

#### Scenario: 服务编码重名
- **WHEN** 服务编码修改为已存在的编码
- **THEN** 系统 MUST 拒绝写入并保留原登记

#### Scenario: 项目改码后历史定位仍可解析
- **WHEN** 项目编码由 `pig` 改为 `pigs` 且存在 `pig/api` 历史定位
- **THEN** 该历史定位 MUST 更新为 `pigs/api`，旧项目服务定位继续可解析

#### Scenario: 改码目标目录已占用
- **WHEN** 项目或服务改码对应的受管目标目录已存在
- **THEN** 系统 MUST 拒绝整个改码，保持原编码、清单版本与来源路径不变，保留源目录和目标目录全部内容

#### Scenario: 受管目录改码原子提交
- **WHEN** 项目或服务的受管目录目标不存在且代码修改有效
- **THEN** 系统 MUST 在一个可恢复事务中提交目录改名与登记更新；任一部分失败 MUST 恢复原目录和原清单

#### Scenario: 项目目录内代码库随项目改码迁移
- **WHEN** 受管项目目录中包含已登记的工作空间内代码库，且项目编码发生变化
- **THEN** 系统 MUST 同时改名项目目录并更新所有以该目录为前缀的代码库 `source.path`；代码库身份、Git 声明和服务模块路径保持不变

#### Scenario: 祖先代码库中的服务路径随项目改码更新
- **WHEN** 服务的代码库根位于受管项目目录之外，且该服务 `modulePath` 指向将移动的项目目录
- **THEN** 系统 MUST 在同一事务中更新 `modulePath` 前缀，使其仍指向移动后的目录；不指向该项目目录的模块路径保持不变

#### Scenario: 附接项目改码
- **WHEN** 项目编码变化且项目来源位于附接（attached）目录
- **THEN** 系统 MUST 保留实际来源路径，不得移动该外部目录或以同名工作空间目录替代

### Requirement: 服务登记与编辑维护项目归属
新增服务 MUST 可归属多个项目：请求级父项目 `projectId` MUST 始终并入最终归属；若显式提供 `projectIds`，其集合 MUST 表示用户指定的完整服务归属并覆盖由 `projectCode` 或服务目录推导的归属；未显式提供 `projectIds` 时，系统 MUST 使用 `projectCode` 或目录推导补充归属。所有最终引用 MUST 写入相关项目 `serviceIds`，未知项目标识或编码 MUST 被拒绝。项目内 `newServices` 草稿 MUST 始终关联父项目；草稿显式携带的其他 `projectIds` MUST 被验证并一并写入关系，不能忽略。编辑服务 MUST 可通过 `projectIds` 按全量语义调整归属；编辑项目 MUST 可通过 `serviceIds` 按全量语义调整成员并可在同一提交携带 `newServices` 新建成员，行为与项目服务关联入口一致，解除关联不删除服务。

#### Scenario: 选择代码库时项目归属仍生效
- **WHEN** 新增服务选择已有代码库并携带 `projectCode`，且未显式提交 `projectIds`
- **THEN** 系统 MUST 完成服务登记并把服务写入该项目成员，项目归属不得因代码库选择被丢弃

#### Scenario: 显式服务归属覆盖目录推导
- **WHEN** 新增服务的目录位于一个项目下，但显式 `projectIds` 选择其他项目，同时请求级 `projectId` 指定固定父项目
- **THEN** 系统 MUST 关联显式 `projectIds` 与请求级父项目，并不得将目录所属项目作为额外归属

#### Scenario: 项目内新服务保留草稿归属
- **WHEN** 项目创建或项目更新中的 `newServices` 草稿携带其他已登记项目的 `projectIds`
- **THEN** 系统 MUST 同时关联父项目与草稿指定项目；任一引用无效时 MUST 拒绝整个父级更新且不留下部分登记

#### Scenario: 项目改码同时内联新增目录服务
- **WHEN** 同一项目更新修改项目编码并携带以服务目录模式创建的 `newServices` 草稿
- **THEN** 系统 MUST 使用待提交的新项目编码校验归属，并在迁移项目目录后于新路径创建服务目录；任一步失败 MUST 不保留部分目录或清单更新

#### Scenario: 编辑服务调整项目归属
- **WHEN** 服务编辑提交与当前归属不同的 `projectIds`
- **THEN** 系统 MUST 原子更新相关项目成员集合并为新归属补充历史定位，解除关联不删除服务
