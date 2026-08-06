## MODIFIED Requirements

### Requirement: Local App 必须以 Application terminal projection 展示 Task 交付事实
Local App Task 详情 MUST 保持“概览、研发、证据、环境”四个一级页签，并 MUST 只通过 Application read model 获取 terminal delivery facts。HTTP/Web MUST NOT 直接读取 SQLite、扫描 Finish JSON、计算 identity、判断 live currentness 或接受 target/root/path filesystem query。development、reviews、verification 三个专业页签 MUST 分别直接读取自身专业 Application current read model，并只读取共享 Task Record 与 lifecycle read model 中已写入的 terminal delivery association；三个页签 MUST NOT 依赖完整 `inspectTaskTerminalDelivery` 聚合投影或重新匹配当前专业 Result 与 handoff。

#### Scenario: completed delivered Task
- **WHEN** terminal association snapshot 表示 Task 已 delivered
- **THEN** 研发页主结论 MUST 显示“已交付”，并展示交付时 Task context、planning disposition、Content Target、verification policy、Candidate/generation 与 Development handoff
- **AND** MUST 展示 final commit/ref、完成时间与 Environment cleanup 为正常结果
- **AND** GET MUST NOT 扫描 Finish Result、恢复 Environment、观察 Git 或调用其他专业页签的 current reader

#### Scenario: completed noChange Task
- **WHEN** Task completed 且 result.noChange 为 true
- **THEN** 页面 MUST 显示“已完成，无需交付变更”
- **AND** MUST NOT 要求或伪造 Finish Result

#### Scenario: completed Task 缺少匹配 Finish
- **WHEN** Task completed、非 noChange 且 lifecycle read model 没有匹配成功 Finish summary
- **THEN** 页面 MUST 显示“已完成，但交付未经证明”
- **AND** MUST NOT 使用 delivered 的绿色成功语义

#### Scenario: terminal 证据视图
- **WHEN** lifecycle read model 返回 Review/Verification delivery association
- **THEN** 证据页 MUST 使用“已随交付候选采用”与“已随交付目标验证通过/未通过”等交付时文案
- **AND** MUST 将 live applicability 改为最近一次生命周期确认的 persisted applicability，不得在读取时重算
- **AND** reviews 与 verification MUST 分别只调用各自专业 reader 加载正文

#### Scenario: 三个页签读取隔离
- **WHEN** 客户端分别请求 development、reviews、verification endpoint
- **THEN** 每个 endpoint MUST 读取自身专业 current record、共享 Task Record 与已写 terminal association
- **AND** 单个 endpoint MUST NOT 调用 `inspectTaskTerminalDelivery` 或读取另外两个专业 current record
- **AND** 相同请求的读取次数 MUST 不随其他专业 Result 是否存在而增加

#### Scenario: 技术详情与单卡宽度
- **WHEN** 页面展示 SHA、digest、`workspace-sqlite:` locator 或单一 Verification Result
- **THEN** 技术标识 MUST 位于次要或可展开详情，Verification 单卡 MUST 使用合理最大宽度
- **AND** Agent 生成的原始 evidence 内容 MUST 保持原文，不由 Web 翻译或改写

Task Finish MAY 请求Development Application针对一个允许的carrier root重观测complete Content Target，但MUST NOT创建Candidate。只有carrier Content Target与handoff Candidate绑定的target逐component相等且Task context/policy仍current时，Application MUST返回equivalent；否则MUST返回Development handoff失效。上述 Finish 动作完成后 MUST 写入 terminal read model；读取 terminal Task 时不得重新执行该重观测。

#### Scenario: 只增加delivery commit
- **WHEN** Finish机械提交当前内容但所有scope bytes与逻辑语义未变化
- **THEN** carrier equivalence MUST通过且Candidate identity保持不变
- **AND** commit、branch与ref MUST不进入Content Target或Candidate identity

#### Scenario: carrier prepare改变内容
- **WHEN** rebase、sync、archive、生成或冲突处理改变任一component identity
- **THEN** equivalence MUST失败并判定current handoff失效
- **AND** Finish MUST退出到Development重新验证和生成Candidate
