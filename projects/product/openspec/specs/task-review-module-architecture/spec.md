# task-review-module-architecture Specification

## Purpose

定义 Task Review 纵向能力在 `task` 模块中的分层归属、窄模块入口、唯一装配和兼容退出边界。

## Requirements

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
Task Review module MUST公开v2 inspect/record Application、只读Persistence与runtime port；MUST NOT公开prompt生成、target applicability或Development gate适配方法。保留和修改的Review人工源码 MUST以TypeScript为唯一实现。

#### Scenario: Bootstrap组装Review模块
- **WHEN** Bootstrap创建完整runtime
- **THEN** Review module MUST只requires Task Record persistence和Workspace structured store机制
- **AND** Task Development module MUST不requires Review Application

#### Scenario: consumer 读取或记录 Review Result
- **WHEN** CLI、HTTP或Web需要Review事实
- **THEN** MUST只通过Task Review Application和公开module port调用inspect/record

#### Scenario: 未迁移 consumer 使用兼容方法
- **WHEN** 旧consumer请求prompt、target applicability或Review gate adapter
- **THEN** module MUST不提供兼容方法并由调用面原子迁移

### Requirement: 迁移必须保持 Task Review 外部与持久化行为等价
迁移 MUST保留两个可选slot、原子current替换、可移植证据与Task identity，同时按v2明确改变subject、outcome和CAS契约；MUST NOT保留v1双读或prompt stub。

#### Scenario: 旧current row升级
- **WHEN** v1数据库首次由集成后的retained runtime执行合法writer
- **THEN** migration MUST把全部合法v1 rows转换为v2并保持slot数量与语义
- **AND** 非法row MUST使整次migration回滚

#### Scenario: 迁移前后执行 Task Review journeys
- **WHEN** 同一组inspect、record、slot隔离、写失败和并发场景分别在fresh v2与v1升级数据库运行
- **THEN** MUST得到相同v2外部结果与原子安全边界
