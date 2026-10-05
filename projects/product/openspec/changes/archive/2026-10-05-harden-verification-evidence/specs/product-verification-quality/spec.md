## ADDED Requirements

### Requirement: 完整候选必须具有真实前端逻辑及核心浏览器证据
Buildr 主包完整候选（Candidate）MUST 在唯一验证登记中包含 `services/buildr-web` 完整单元测试（Unit Test）入口，并 MUST 具有消费同一唯一候选压缩包（Candidate Tarball）的核心浏览器验收（Browser Verification）。源码测试、页面旅程、独立 DSH 插件验证和跨平台检查 MUST 各自表达实际覆盖，MUST NOT 相互替代。

#### Scenario: 自动选择前端逻辑回归
- **WHEN** 受影响路径属于 Buildr Web 源码、测试或工具链
- **THEN** 验证计划 MUST 选择真实 `services/buildr-web` 单元测试（Unit Test）完整入口
- **AND** 完整候选（Candidate）MUST 无条件包含该入口，不能只运行后端导入的少量前端辅助函数测试

#### Scenario: 候选浏览器消费同一产物
- **WHEN** 完整候选（Candidate）的唯一压缩包已产生且身份通过校验
- **THEN** 核心浏览器验收（Browser Verification）MUST 直接消费该压缩包内的 `web-dist` 并完成现有核心代表旅程
- **AND** MUST NOT 从源码重新构建替代网页、生成另一压缩包或使用本机旧产物
- **AND** 证据 MUST 绑定相同源码提交、验证登记身份、压缩包摘要及实际选择器（Selector）范围

#### Scenario: 候选浏览器证据缺失或失败
- **WHEN** 核心浏览器分片（Shard）缺失、失败或绑定的产物身份不同
- **THEN** 完整候选聚合 MUST 失败并指出对应缺口
- **AND** 其他源码或产物检查通过 MUST NOT 被报告为该页面旅程已通过

#### Scenario: 独立插件路径受到影响
- **WHEN** 受影响路径属于 `services/dsh-plugin` 源码、构建、测试或锁定工具链
- **THEN** 验证计划 MUST 选择插件现有完整隔离验证入口，覆盖两种构建与真实装载器（Loader）
- **AND** Buildr 主包完整候选（Candidate）MUST NOT 因此纳入独立插件包或宣称用户当前桌面已经验收

### Requirement: main 的候选门禁不得因来源过滤显示虚假成功
所有指向 `main` 的合并请求（Pull Request）MUST 实际进入候选检查（Candidate Gate）；支持来源及精确提交的现有校验 MUST 保持有效，不支持的来源 MUST 明确失败，MUST NOT 因作业条件跳过而产生可被必需检查接受的成功结果。

#### Scenario: 不支持的来源指向 main
- **WHEN** 合并请求（Pull Request）指向 `main` 且来源不满足现有候选来源规则
- **THEN** 候选检查（Candidate Gate）MUST 实际执行来源校验并失败
- **AND** MUST NOT 通过扩大合法来源集合或条件跳过放行

#### Scenario: 已支持来源指向 main
- **WHEN** 合并请求（Pull Request）来自已支持来源且指向 `main`
- **THEN** 候选检查（Candidate Gate）MUST 继续校验精确提交及完整分布式候选证据
