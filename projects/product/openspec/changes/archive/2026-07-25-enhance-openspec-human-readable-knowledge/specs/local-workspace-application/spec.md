## MODIFIED Requirements

### Requirement: 本机应用必须提供可链接的 Change 详情页
Buildr 本机应用 MUST 使用稳定独立路由展示 Change 详情，并 MUST 将生命周期摘要、人类可读 Brief、技术 artifacts 与短 prompt 交互分离。页面 MUST 优先帮助普通用户理解 Change，再提供 proposal、design、specs 和 tasks 的可深入入口。

#### Scenario: 打开 Change 详情
- **WHEN** 用户访问 `/changes/<projectCode>/<changeRef>` 且 read model 返回 Brief
- **THEN** 页面 MUST 先展示 identity、lifecycle、任务进度和更新时间，再展示 Brief 的人类可读内容
- **AND** proposal、design、specs、tasks MUST 位于 Brief 之后并可按 artifact 深入查看
- **AND** 页面刷新后 MUST 保持同一 Change 上下文

#### Scenario: 打开缺少 Brief 的 Change 详情
- **WHEN** 用户访问合法 Change 且 read model 报告 Brief unavailable
- **THEN** 页面 MUST 显示明确缺失状态并继续展示可用的标准 artifacts
- **AND** 页面 MUST NOT 在浏览器或 API 请求期间生成、保存或推断 Brief

#### Scenario: Change 不存在
- **WHEN** 详情 API 返回 not found
- **THEN** 页面 MUST 显示明确空状态并提供返回 Change 表格的入口

#### Scenario: 详情中的 Agent 行为
- **WHEN** 用户在详情中选择继续或审阅
- **THEN** 页面 MUST 打开短交互抽屉并生成可复制 prompt
- **AND** MUST NOT 叠加承载第二份完整 Change 详情的二级抽屉

#### Scenario: 普通用户深入技术 artifacts
- **WHEN** 用户从 Brief 继续查看 proposal、design、specs 或 tasks
- **THEN** 页面 MUST 保留每类 artifact 的身份、availability 和原始内容
- **AND** Brief 摘要 MUST NOT 覆盖、截断或改写技术 artifact 的权威内容
