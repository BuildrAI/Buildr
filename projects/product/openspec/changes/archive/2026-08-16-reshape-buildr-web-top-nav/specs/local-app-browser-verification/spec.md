## ADDED Requirements

### Requirement: 上下结构壳层必须继续暴露既有导航钩子
Buildr Web 将主导航从侧栏改为顶栏后，browser smoke 与集成测试 MUST 仍能通过既有 `data-nav` 与稳定 id 定位任务、项目、服务、文章、交给 Agent、退出与 preview 身份。测试 MUST NOT 把 `.app-sider` 或侧栏分组 DOM 当作导航存在的必要条件。每个 `data-nav` 值在页面中 MUST 至多对应一个可点击主导航节点，以免定位歧义。

#### Scenario: 顶栏保留 data-nav
- **WHEN** 用户进入 Workspace 并打开任务、项目、服务或文章路由
- **THEN** 对应 `[data-nav=tasks|projects|services|articles]` MUST 存在且带有 `active` class
- **AND** `#open-agent-action`、`#preview-identity` 与退出控件 MUST 仍可定位
- **AND** `#preview-identity` MUST NOT 占用顶栏可见空间

#### Scenario: 测试不依赖侧栏结构
- **WHEN** 布局断言检查主导航
- **THEN** 断言 MUST 以 `data-nav` 或稳定 id 为准
- **AND** MUST NOT 要求存在 `aside.app-sider` 才能判定导航可用
