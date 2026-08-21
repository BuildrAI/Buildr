## ADDED Requirements

### Requirement: Task Review 必须归属 Task 模块的明确技术分层
Buildr MUST 将 Task Review Domain、Application、Persistence、CLI 与直接 HTTP adapter 归入 `src/task` 对应技术层，并 MUST 默认在技术层内保持扁平。迁移后旧全局技术层路径 MUST 不再保留第二份实现或转发入口。

#### Scenario: 检查生产源码归属
- **WHEN** 架构验证扫描 Task Review 生产实现
- **THEN** Domain、Application、Repository、CLI 与 HTTP adapter MUST 只存在于 `src/task` 的对应技术层
- **AND** `src/domain/task-review`、`src/application/task-review`、`src/interfaces/cli/task-review.mjs` 与 `src/task/persistence/review` MUST 不再提供 Task Review 实现

### Requirement: Task Review 必须通过窄模块入口唯一装配
Buildr MUST 由 `src/task/module.mjs` 的 Task Review descriptor 显式声明 required capabilities、provided capabilities 与 CLI/HTTP contributions。Bootstrap MUST 是唯一 composition root，legacy runtime、全局 Task persistence 聚合、CLI Host 与 HTTP Host MUST NOT 再直接注册或导入 Task Review 内部实现。

#### Scenario: 创建 Bootstrap runtime
- **WHEN** Bootstrap 按依赖顺序安装 Task Record 与 Task Review modules
- **THEN** module registry MUST 只登记一个 `task-review` module 和唯一 Task Review CLI/HTTP contributions
- **AND** 缺少 required capability、重复 capability 或重复 contribution 时 MUST fail closed

#### Scenario: Host 构建命令和 HTTP 路由
- **WHEN** CLI Host 或 HTTP Host 暴露 Task Review 行为
- **THEN** Host MUST 消费 module registry contributions
- **AND** Host MUST NOT 直接导入 Task Review CLI/HTTP adapter 或自行注册 Task Review Application/Repository

### Requirement: Task Review 模块端口必须保持 writer authority 与兼容边界
Task Review module MUST 只公开共享 Application、只读 persistence port 和有 owner、scope、退出条件的 Bootstrap compatibility port。Repository writer MUST 保持为模块私有依赖，CLI、HTTP、Skill 与其他 consumer MUST 继续通过 Task Review Application 写入 Result。

#### Scenario: consumer 读取或记录 Review Result
- **WHEN** CLI、HTTP、Skill 或 Task lifecycle consumer 需要 Task Review 能力
- **THEN** consumer MUST 复用同一 Application read/write 方法及其既有 JSON read model
- **AND** consumer MUST NOT 直接写 SQLite、创建第二套 writer 或取得 Task Review schema/system field authority

#### Scenario: 未迁移 consumer 使用兼容方法
- **WHEN** 当前切片之外的既有 consumer 仍通过 runtime method 调用 Task Review
- **THEN** Bootstrap compatibility port MAY 投射同一模块实现的方法
- **AND** 该 port MUST 声明 owner、限定 existing runtime consumers，并把删除条件绑定到后续 consumer migration 与 legacy convergence

### Requirement: 迁移必须保持 Task Review 外部与持久化行为等价
Task Review 模块迁移 MUST 保持公开 CLI、HTTP、JSON、Review Result schema、Planning/Completion slots、applicability、SQLite schema、查询字段、事务、原子替换、rollback 和幂等语义不变。Application Payload 和 npm candidate MUST 继续提供等价入口。

#### Scenario: 迁移前后执行 Task Review journeys
- **WHEN** checkout 或 npm candidate 执行 inspect、record、Web prompt、无 Result、stale target、terminal Task 或注入写入失败场景
- **THEN** operation、status、diagnostic、effects、JSON schema、SQLite bytes 与 rollback 结果 MUST 与既有契约等价
- **AND** migration 顺序和 checksum MUST 不发生变化
