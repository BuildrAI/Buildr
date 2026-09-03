## MODIFIED Requirements

### Requirement: Task Review 必须归属 Task 模块的明确技术分层
Buildr MUST将 Task Review Domain、Application、Persistence、CLI 与直接 HTTP adapter 归入 `src/task` 对应技术层，以 `.ts` 作为唯一人工源码并使用实际类型。迁移后旧全局技术层路径和同名 `.mjs` MUST不再保留第二份实现或转发入口。

#### Scenario: 检查生产源码归属
- **WHEN** 架构验证扫描 Task Review 生产实现
- **THEN** Domain、Application、Repository、CLI 与 HTTP adapter MUST只存在于 `src/task` 对应 `.ts` 技术层
- **AND** 这些文件 MUST无 `@ts-nocheck` 或公共 `any` 边界

### Requirement: Task Review 必须通过窄模块入口唯一装配
Buildr MUST由 `src/task/module.ts` 的 Task Review descriptor 显式声明 required capabilities、provided capabilities 与 CLI/HTTP contributions。Bootstrap MUST是唯一 composition root，legacy runtime、全局 Task persistence 聚合、CLI Host 与 HTTP Host MUST不直接注册或导入 Task Review 内部实现。

#### Scenario: 创建 Bootstrap runtime
- **WHEN** Bootstrap 按依赖顺序安装 Task Record 与 Task Review modules
- **THEN** module registry MUST只登记一个 `task-review` module 和唯一 Task Review CLI/HTTP contributions
- **AND** 缺少 required capability、重复 capability 或重复 contribution 时 MUST fail closed

#### Scenario: Host 构建命令和 HTTP 路由
- **WHEN** CLI Host 或 HTTP Host 暴露 Task Review 行为
- **THEN** Host MUST消费 module registry contributions
- **AND** Host MUST不直接导入 Task Review 内部 adapter 或自行注册 Application/Repository
