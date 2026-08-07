## ADDED Requirements

### Requirement: Browser smoke 必须验证生产托管的 Local App 构建产物
Buildr Product browser smoke MUST 针对由 `buildr app`（或测试夹具中的等价 Local App HTTP server）生产托管的 Local App Web 构建产物执行，MUST NOT 将 Vite 开发服务器或 HMR 会话当作 delivery-required browser 完成证据。React 迁移不得取消既有可独立选择的 shell、project、service、task、articles（及仍声明的 change）browser selector；受影响切片 MUST 仍可按 changed planner 独立选择。

#### Scenario: Smoke uses production static hosting
- **WHEN** `product.browser-smoke` or a browser selector runs during Candidate or delivery verification
- **THEN** the harness MUST start Local App HTTP hosting of the built web dist on an isolated loopback port
- **AND** MUST NOT require a concurrent Vite dev server for the assertions to pass

#### Scenario: Selectors remain independently choosable after React migration
- **WHEN** only Task detail UI wiring changes
- **THEN** changed planner MUST be able to select Task browser integration without forcing unrelated Project or Service browser journeys
- **AND** Shell browser integration MUST remain available when bootstrap、router or global navigation changes

#### Scenario: Functional coverage checklist remains enforceable
- **WHEN** React migration claims feature parity complete
- **THEN** browser verification MUST still cover workspace shell navigation、Project/Service metadata flows、articles、Task list/detail terminal states and Agent Action prompt-only behavior as declared by existing browser smoke scenarios
- **AND** MUST NOT replace those assertions with source-text scans of React components
