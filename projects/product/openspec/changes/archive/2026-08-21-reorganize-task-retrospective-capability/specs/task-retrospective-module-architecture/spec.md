## ADDED Requirements

### Requirement: Task Retrospective 必须归属 Task 模块的明确技术分层
Buildr MUST 将 Task Retrospective Domain、Application、Persistence、Internal driver 与直接 HTTP adapter 归入 `src/task` 对应技术层，并 MUST 默认在技术层内保持扁平。迁移后旧全局技术层路径 MUST 不再保留第二份实现或转发入口。

#### Scenario: 检查生产源码归属
- **WHEN** 架构验证扫描 Task Retrospective 生产实现
- **THEN** Domain、Application、Repository、Internal driver 与 HTTP adapter MUST 只存在于 `src/task` 的对应技术层
- **AND** `src/domain/task-retrospective`、`src/application/task-retrospective`、`src/task/persistence/retrospective` 与 `src/interfaces/internal/task-retrospective-*` MUST 不再提供实现

### Requirement: Task Retrospective 必须通过窄模块入口唯一装配
Buildr MUST 由 `src/task/module.mjs` 的 Task Retrospective descriptor 显式声明 required capabilities、provided capabilities、HTTP contribution 与 internal workflow runner。Bootstrap MUST 是唯一 composition root，legacy runtime、全局 Task persistence 聚合、HTTP Host 与公共 internal workflow router MUST NOT 再直接注册或导入 Task Retrospective 内部实现。

#### Scenario: 创建 Bootstrap runtime
- **WHEN** Bootstrap 按依赖顺序安装 Task Record 与 Task Retrospective modules
- **THEN** module registry MUST 只登记一个 `task-retrospective` module 和唯一 HTTP contribution
- **AND** 缺少 required capability、重复 capability 或重复 contribution 时 MUST fail closed

#### Scenario: Host 分发 HTTP 与内部 workflow
- **WHEN** HTTP Host 或 bundled internal workflow router 暴露 Task Retrospective 行为
- **THEN** HTTP Host MUST 消费模块 contribution，internal router MUST 消费模块公开 runner
- **AND** 两个 Host MUST NOT 自行注册 Repository/Application 或直接依赖旧实现路径

### Requirement: Task Retrospective 模块端口必须保持唯一 writer authority
Task Retrospective module MUST 只公开共享 Application、只读 Persistence port 和有 owner、scope、退出条件的 Bootstrap compatibility port。Repository writer MUST 保持为模块私有依赖，Buildr Web、Skill、内部 runner 与其他 consumer MUST 继续通过 Task Retrospective Application 写入 current Result 与处置元数据。

#### Scenario: consumer 读取或写入复盘
- **WHEN** Buildr Web、Skill、内部 runner 或 Task lifecycle consumer 需要 Task Retrospective 能力
- **THEN** consumer MUST 复用同一 Application 的 `inspect | list | record | handle` 行为及既有 JSON read model
- **AND** consumer MUST NOT 直接写 SQLite、创建第二套 writer 或取得 schema/system field authority

#### Scenario: 未迁移 consumer 使用兼容方法
- **WHEN** 当前切片之外的既有 runtime consumer 仍调用 Task Retrospective 方法
- **THEN** Bootstrap compatibility port MAY 投射同一模块实现的方法
- **AND** 该 port MUST 声明 owner、限定 existing runtime consumers，并把删除条件绑定到后续 consumer migration 与 legacy convergence

### Requirement: 迁移必须保持 Task Retrospective 行为与存储等价
Task Retrospective 模块迁移 MUST 保持复盘报告、`pending | handled | no-action` 处置、response-only current digest、CAS、terminal Task 限制、公开 CLI/HTTP/JSON、SQLite schema、事务、锁、原子替换、rollback 和幂等语义不变。Application Payload 与 npm candidate MUST 继续提供等价的 bundled `__internal task-retrospective` 入口。

#### Scenario: 迁移前后执行 Retrospective journeys
- **WHEN** checkout 或 npm candidate 执行 list、inspect、record、handle、缺失记录、active Task、陈旧 digest 或注入写入失败场景
- **THEN** operation、status、diagnostic、effects、JSON schema、SQLite bytes 与 rollback 结果 MUST 与既有契约等价
- **AND** migration 顺序和 checksum MUST 不发生变化
