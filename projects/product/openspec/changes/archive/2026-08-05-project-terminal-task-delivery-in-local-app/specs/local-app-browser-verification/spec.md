## ADDED Requirements

### Requirement: Task Browser Smoke 必须区分 active currentness 与 terminal delivery
自动 Browser Smoke MUST 使用独立 fixture 覆盖 active unknown、active ready/current、真实 stale、completed delivered 与 completed unproven，并 MUST 对 terminal 研发/证据主文案、四页签、技术详情层级和安全 HTTP 行为形成可重复 assertion。手工浏览器检查 MUST NOT 被报告为自动 E2E。

#### Scenario: active unknown fixture
- **WHEN** active Task 的 Environment unavailable
- **THEN** Browser Smoke MUST 断言研发状态仍为 unknown 且不出现 delivered

#### Scenario: completed delivered fixture
- **WHEN** fixture 含 matching Task、Development handoff、Review/Verification Results 与成功 Finish completion
- **THEN** Browser Smoke MUST 断言“已交付”、交付时证据关联和 cleanup 正常文案
- **AND** MUST 断言页面未把历史实时轴显示为 current

#### Scenario: completed unproven fixture
- **WHEN** completed Task 缺少 matching successful Finish
- **THEN** Browser Smoke MUST 断言“交付未经证明”且不使用 delivered 样式

#### Scenario: 真实 stale fixture
- **WHEN** active Result target 与 current target identity 不一致
- **THEN** Browser Smoke MUST 断言真实 stale 文案，而不是 unknown 或 delivered
