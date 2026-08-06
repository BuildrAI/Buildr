## MODIFIED Requirements

### Requirement: Task 详情必须只读投影 current Verification Result
本机应用 MUST 在 Task 详情“证据”视图提供“验证结果（Verification Result）”区块，并 MUST 通过 Task Verification Application inspect 展示 Result presence、target、declarations、实际 capability facts、coverage gaps、结论、resultDigest 与由最近一次正式 Verification action 保存的 applicability。页面 MUST 不直接读取 Result YAML，不得伪造当前 target identity，也不得暴露 Result writer；inspect MUST 只查询 SQLite current record 与 lifecycle read model，不执行 declaration 或 Content Target 观察。

#### Scenario: 查看已有 Result
- **WHEN** 用户打开 Task 的“证据”视图
- **THEN** API MUST 返回 Application 的 current read model 并设置 no-store
- **AND** 验证结果区块 MUST 显示保存时的 declaration/target applicability、observedAt 与当前结果
- **AND** GET MUST NOT 执行 declaration、Git、文件或 Environment observation

#### Scenario: Result 不存在
- **WHEN** Task 尚无 current Verification Result
- **THEN** 验证结果区块 MUST 显示空状态与“交给 Agent 验证”的动作
- **AND** Task Record、Environment、Development、Review 与其他视图 MUST 正常工作

#### Scenario: lifecycle snapshot 不存在
- **WHEN** Task 有 current Verification Result 但尚无对应 lifecycle read model snapshot
- **THEN** 验证结果区块 MUST 显示已有 Result 与稳定的 unknown/unavailable applicability
- **AND** GET MUST NOT 为了补齐 snapshot 修改数据库或读取外部声明

#### Scenario: 尝试直接写 Result API
- **WHEN** 客户端向 Task verification resource 发送 POST/PUT/PATCH/DELETE
- **THEN** 本机应用 MUST 不提供该路由
- **AND** Task Record、Environment、Development、Review、已有 Result bytes 与 lifecycle read model MUST 保持不变

### Requirement: Local App 必须以 Application terminal projection 展示 Task 交付事实
Local App Task 详情 MUST 保持“概览、研发、证据、环境”四个一级页签，并 MUST 只通过 Application read model 获取 terminal delivery facts。HTTP/Web MUST NOT 直接读取 SQLite、扫描 Finish JSON、计算 identity、判断 live currentness 或接受 target/root/path filesystem query；Terminal Delivery Application MUST 只查询 SQLite 中由 Finish/Task Development lifecycle action 保存的 terminal summary。

#### Scenario: completed delivered Task
- **WHEN** terminal projection 返回 delivered
- **THEN** 研发页主结论 MUST 显示“已交付”，并展示交付时 Task context、planning disposition、Content Target、verification policy、Candidate/generation 与 Development handoff
- **AND** MUST 展示 final commit/ref、完成时间与 Environment cleanup 为正常结果
- **AND** GET MUST NOT 扫描 Finish Result、恢复 Environment 或观察 Git

#### Scenario: completed noChange Task
- **WHEN** Task completed 且 result.noChange 为 true
- **THEN** 页面 MUST 显示“已完成，无需交付变更”
- **AND** MUST NOT 要求或伪造 Finish Result

#### Scenario: completed Task 缺少匹配 Finish
- **WHEN** Task completed、非 noChange 且 lifecycle read model 没有匹配成功 Finish summary
- **THEN** 页面 MUST 显示“已完成，但交付未经证明”
- **AND** MUST NOT 使用 delivered 的绿色成功语义

#### Scenario: terminal 证据视图
- **WHEN** terminal projection 返回 Review/Verification delivery association
- **THEN** 证据页 MUST 使用“已随交付候选采用”与“已随交付目标验证通过/未通过”等交付时文案
- **AND** MUST 将 live applicability 改为最近一次生命周期确认的 persisted applicability，不得在读取时重算

#### Scenario: 技术详情与单卡宽度
- **WHEN** 页面展示 SHA、digest、`workspace-sqlite:` locator 或单一 Verification Result
- **THEN** 技术标识 MUST 位于次要或可展开详情，Verification 单卡 MUST 使用合理最大宽度
- **AND** Agent 生成的原始 evidence 内容 MUST 保持原文，不由 Web 翻译或改写

Task Finish MAY 请求Development Application针对一个允许的carrier root重观测complete Content Target，但MUST NOT创建Candidate。只有carrier Content Target与handoff Candidate绑定的target逐component相等且Task context/policy仍current时，Application MUST 返回equivalent；否则MUST返回Development handoff失效。上述 Finish 动作完成后 MUST 写入 terminal read model；读取 terminal Task 时不得重新执行该重观测。

#### Scenario: 只增加delivery commit
- **WHEN** Finish机械提交当前内容但所有scope bytes与逻辑语义未变化
- **THEN** carrier equivalence MUST通过且Candidate identity保持不变
- **AND** commit、branch与ref MUST不进入Content Target或Candidate identity

#### Scenario: carrier prepare改变内容
- **WHEN** rebase、sync、archive、生成或冲突处理改变任一component identity
- **THEN** equivalence MUST失败并判定current handoff失效
- **AND** Finish MUST退出到Development重新验证和生成Candidate
