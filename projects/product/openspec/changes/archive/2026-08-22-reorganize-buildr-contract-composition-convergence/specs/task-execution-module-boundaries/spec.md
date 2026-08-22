## ADDED Requirements

### Requirement: Internal Workflow Route 必须分离清单、分发与业务执行
Task 模块 MUST以 contract catalog 作为内部进程级 route 清单，以 internal interface router 按 route id 分发到 runner，并 MUST将真实业务用例保留在 Task Application Service。Bootstrap MUST只通过 Task module 公开入口调用 router，不得拥有或复制 route 清单与分发实现。

#### Scenario: Doctor 读取 route inventory
- **WHEN** Doctor 或静态验证检查 required internal workflow routes
- **THEN** 它 MUST读取 Task contract catalog 的只读 inventory
- **AND** catalog MUST只登记 route metadata，不执行 Task 用例

#### Scenario: Bootstrap 分发内部 route
- **WHEN** CLI 收到 `buildr __internal <route>`
- **THEN** Bootstrap MUST调用 Task module 公开 internal workflow 入口
- **AND** router MUST按 catalog route id 选择 runner
- **AND** runner MUST调用既有 Task Application Service 执行业务

#### Scenario: 未知 route
- **WHEN** router 收到 catalog 未登记的 route id
- **THEN** router MUST返回未匹配结果并保持既有 CLI fallback 行为

#### Scenario: 检查旧顶层 route owner
- **WHEN** 架构验证扫描生产源码
- **THEN** 顶层 `src/application/internal-workflow-route-inventory.mjs` 与 `src/interfaces/internal/formal-workflow-routes.mjs` MUST不存在且无引用
