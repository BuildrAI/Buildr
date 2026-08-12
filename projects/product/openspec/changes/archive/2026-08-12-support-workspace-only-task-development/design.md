## Context

Task Record 允许空 Project/Service scope，Task Environment 会为任何正式 Task 建立 `workspace` selector，Content Target 也能稳定观察该组件。当前 Task Verification declaration observer 只遍历 `scope.projects`，Development policy 与 Verification Result domain 又无条件拒绝空 `declarations`；同时 coverage gap 只接受 `project:*` 或 `service:*`。因此上游正式事实可成立，但 Development 与 Verification 无法表达 workspace-only 的“没有验证能力”事实。

该修复横跨 capability contract、closed value normalization、Application scope 校验、SQLite repository 写入边界、CLI/System 与 Finish 生命周期测试。既有 SQLite current rows、Receipt/Result schemaVersion 和 writer ownership均保持不变。

## Goals / Non-Goals

**Goals:**

- 只有没有显式 Project、Service 所属 Project或Change所属Project的Task才进入workspace-only语义。
- 用现有policy/Result中的空Project declarations与唯一`workspace` coverage gap形成自描述、可移植、稳定identity。
- coverage gap保持`not-passed`，在Result完整前阻止freeze，在freeze后继续要求现有风险接受或明确gate disposition。
- declaration、scope或Content Target变化继续派生stale；旧Receipt/Result保持兼容读取。
- Project-only、Service-scoped、多Project与Project-bound Change继续执行非空declaration和覆盖门禁。

**Non-Goals:**

- 不新增workspace verification declaration文件、capability registry、第二个policy/Result store或Git Receipt。
- 不自动创建测试、自动豁免Verification、自动接受风险或把coverage gap改写为passed。
- 不改变Task Review Result、Candidate shape、Finish五阶段、Task terminal authority或Environment cleanup ownership。
- 不为历史数据生成workspace gap、迁移row或backfill新事实。

## Decisions

### 1. 以有效 Project 集合判定 workspace-only

Task Record domain提供确定性helper，计算：

```text
explicit scope.projects
+ scope.services[*].project
+ changes[*].project
```

去重排序后的并集为空才是workspace-only。Task Verification declaration observer、Development coverage校验和Verification Result校验复用该定义。选择该方案而不是只看`scope.projects.length`，是为了避免Service或Project-bound Change通过省略冗余Project字段绕过declaration。

### 2. 用既有closed shape表达workspace事实，不增加schema字段

Development policy和Verification Result仅在以下自描述组合成立时接受空`declarations`：

- `capabilities`为空；
- `coverageGaps`恰有一项，`scope`为`workspace`；
- Development policy `overrides`为空；
- Verification Result conclusion为`not-passed`。

Project模式仍要求非空declarations。选择该方案而不是伪造`project: workspace` sentinel或新增workspace declaration文件，是因为workspace当前没有独立验证声明authority；选择它而不是新增schema discriminator，是为了保持v3 Development Receipt与v1 Verification Result的closed持久形状和旧数据读取。

### 3. Application负责授权语义，domain负责自描述值完整性

Application根据current Task Record决定是否允许`workspace` gap，并校验declaration observation与有效Project集合精确一致。Domain允许读取已经保存的自描述workspace值，使Task后来增加Project/Service/Change时旧policy/Result仍能被读取并通过identity比较派生stale；repository只在新写入时拒绝Task scope不匹配的workspace值。

该分层避免两种错误：读取时因current scope变化把旧row误判为损坏，以及Project Task直接调用writer写入workspace值。

### 4. coverage gap沿用现有负向gate流程

workspace policy形成后，Candidate freeze仍必须读取current Task Verification Result并确认Result包含同一`workspace` gap。没有Result或gap不匹配时freeze blocked；matching Result只能是`not-passed`，事实完整后可以freeze，但`proceed`和handoff仍要求绑定精确Result digest、`scope: workspace`与明确授权source的风险接受，或使用现有gate waiver/not-applicable机制。Task Finish只消费最终current handoff，不补跑Verification。

### 5. 兼容读取但不回填历史事实

既有非空Project declarations的Development Receipt v1/v2/v3与Verification Result v1按原规则读取。新workspace值继续使用当前schemaVersion；没有workspace事实的历史Task保持missing/blocked，不自动写gap。旧文件store继续inert，SQLite仍是唯一current authority。

## Risks / Trade-offs

- [空declarations在脱离Task context时容易被误用] → domain要求唯一workspace gap的自描述组合，Application/repository写入再绑定current Task有效Project集合。
- [Service或Change隐含Project被遗漏] → declaration observation统一使用有效Project并集，并增加Service-only、Change-bound和多Project回归。
- [workspace gap被误解为验证通过] → Result强制`not-passed`，freeze前要求完整Result，proceed/handoff继续要求现有风险授权。
- [scope变化导致旧row不可读] → 读取允许自描述workspace值，仅在Application currentness比较时派生stale；不按current scope破坏decode。
- [未来出现真实workspace verification capability] → 本Change不预建声明authority；届时以新的窄Change扩展workspace capability model。

## Migration Plan

1. 先增加domain自描述值规则、有效Project helper和Application/repository写入门禁。
2. 更新contracts、Skills、canonical specs与current knowledge说明。
3. 运行domain、Application、repository、CLI/System及完整Finish回归。
4. OpenSpec converge后通过现有Formal Verification、Completion Review、Development handoff和Task Finish交付。

回滚只需回退本Change代码与规范；因为不迁移、不回填、不新增表，既有Project rows没有数据回滚步骤。已经由新版合法写入的workspace row在旧版会fail closed，不能静默降级；回滚前必须保留现场并升级回兼容版本处理。

## Open Questions

无。真实workspace capability declaration与自动化执行不属于本Change。
