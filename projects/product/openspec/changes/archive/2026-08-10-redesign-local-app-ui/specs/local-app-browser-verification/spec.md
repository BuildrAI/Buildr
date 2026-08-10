## MODIFIED Requirements

### Requirement: Browser smoke 必须验证生产托管的 Local App 构建产物
Buildr Product browser smoke MUST 针对由 `buildr app`（或测试夹具中的等价 Local App HTTP server）生产托管的 Local App Web 构建产物执行，MUST NOT 将 Vite 开发服务器或 HMR 会话当作 delivery-required browser 完成证据。UI 视觉/布局重设计不得取消既有可独立选择的 shell、project、service、task、articles（及仍声明的 change）browser selector；受影响切片 MUST 仍可按 changed planner 独立选择。

#### Scenario: Smoke uses production static hosting
- **WHEN** `product.browser-smoke` or a browser selector runs during Candidate or delivery verification
- **THEN** the harness MUST start Local App HTTP hosting of the built web dist on an isolated loopback port
- **AND** MUST NOT require a concurrent Vite dev server for the assertions to pass

#### Scenario: Selectors remain independently choosable after React migration
- **WHEN** only Local App shell or page visual/layout wiring changes
- **THEN** changed planner MUST be able to select the affected browser integration without forcing unrelated resource journeys
- **AND** Shell browser integration MUST remain available when bootstrap、router or global navigation presentation changes

#### Scenario: Functional coverage checklist remains enforceable
- **WHEN** UI redesign claims visual completion within the confirmed scope
- **THEN** browser verification MUST still cover workspace shell navigation、Project/Service metadata flows、articles、Task list/detail terminal states and Agent Action prompt-only behavior as declared by existing browser smoke scenarios
- **AND** MUST NOT replace those assertions with source-text scans of React components or Vite HMR-only checks

## ADDED Requirements

### Requirement: Browser 测试 DOM 钩子策略必须在 UI 重设计中显式遵守
Local App UI 重设计 MUST 按经确认的钩子策略处理 browser smoke 使用的稳定 DOM id / `data-*` 选择器：若策略为保留，实现 MUST 尽量不破坏既有钩子；若策略为重写，同一 Change MUST 同步更新 `product/buildr` 的 browser smoke 选择器，并使受影响 selector 在生产托管路径下重新通过。未确认策略前，实现 MUST NOT 大规模删除或重命名既有测试钩子。

#### Scenario: 保留钩子策略
- **WHEN** Brief 确认“尽量保留现有测试钩子”
- **THEN** 重设计后的页面 MUST 继续暴露既有 smoke 所依赖的稳定钩子（例如工作空间网格、概览标题、任务详情与导航 `data-nav`）
- **AND** browser smoke MUST 在无需改写选择器语义的前提下仍可定位关键控件

#### Scenario: 重写钩子策略
- **WHEN** Brief 确认“允许重写钩子并同步改 browser 测试”
- **THEN** 前端钩子变更与 `test/browser-smoke` 选择器更新 MUST 同 Change 交付
- **AND** 更新后的 smoke MUST 仍在生产托管 dist 上证明功能覆盖，且 MUST NOT 降低可独立选择的 selector 边界
