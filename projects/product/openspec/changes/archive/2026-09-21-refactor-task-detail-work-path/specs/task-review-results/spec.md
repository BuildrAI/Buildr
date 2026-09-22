## MODIFIED Requirements

### Requirement: Task Review 必须使用一个能力维护两个可选 current Result 槽位
Buildr MUST以同一Task Review能力维护`planning|completion`两个可选current槽位及各自完整历史记录。两个槽位 MUST只共享Task ID和Result模型，MUST NOT形成顺序、推进许可或相互前置；没有Task Development、Candidate、Environment或另一个槽位时，active Task仍 MUST可独立record任一真实审查结果。

#### Scenario: 没有Development的普通Task接受完成审查
- **WHEN** Agent对一个active但没有Development Receipt或Candidate的Task完成Completion Review
- **THEN** Application MUST以Agent提交的真实subject identity保存completion Result
- **AND** MUST NOT创建Development、Candidate、gate或另一个Review槽位

#### Scenario: 两种 Review 都已完成
- **WHEN** 同一Task已经保存Planning和Completion Result
- **THEN** inspect MUST分别返回两个current slot且互不覆盖

#### Scenario: 新 Task 尚未执行 Review
- **WHEN** active Task两个slot均不存在
- **THEN** inspect MUST返回两个明确missing slot且不创建占位row

#### Scenario: 旧Review YAML存在
- **WHEN** Workspace保留旧Review YAML文件
- **THEN** v2 Application MUST忽略它且只读取SQLite审查记录

#### Scenario: 未知 Task 请求记录 Result
- **WHEN** caller对不存在的Task执行record
- **THEN** MUST返回Task not found且不得创建orphan Review row

### Requirement: 完整 Review 写入必须原子替换且中断不覆盖 current
`record` MUST要求`expectedCurrentDigest`。空slot MUST使用`absent`，已有slot MUST使用inspect返回的当前digest；Repository MUST在同一事务内比较、写入、回读，任何不匹配或失败 MUST零写入，包含历史追加。

#### Scenario: 两个Agent基于同一current并发记录
- **WHEN** 第一个Agent已替换current后第二个Agent提交旧`expectedCurrentDigest`
- **THEN** 第二次写入 MUST返回稳定conflict与最新digest
- **AND** current MUST保持第一个Agent的完整Result

#### Scenario: Review 执行中断
- **WHEN** Agent在形成完整结论或调用record前中断
- **THEN** current MUST保持不变且不得创建空Result

#### Scenario: 新 Review 正常完成
- **WHEN** caller携带匹配expectedCurrentDigest提交完整v2 Result
- **THEN** Repository MUST在同一事务中保留被替换的完整Result、替换对应slot并返回新digest

#### Scenario: 注入 SQLite mutation 失败
- **WHEN** INSERT或UPDATE在事务中失败
- **THEN** MUST rollback并保留last-valid current

#### Scenario: 注入原子替换失败
- **WHEN** 写后回读、query field一致性或COMMIT失败
- **THEN** MUST rollback且另一个Review slot不受影响

### Requirement: Result digest 必须是响应级值 identity 而不是持久 revision
Application MUST对每份有效Result返回response-only `resultDigest`，不得写入payload或revision列。`record` MUST用该digest或`absent`执行事务内compare-and-set，每次被替换的完整审查结果 MUST保留在该专业能力的只读历史中，但不得建设lease、审批队列或多版本状态机。

#### Scenario: inspect 有效 Result
- **WHEN** Application成功读取任一current Result
- **THEN** read model MUST返回canonical serialization的稳定resultDigest
- **AND** persisted payload MUST不包含resultDigest或revision

#### Scenario: Result 被完整替换
- **WHEN** 同类型新Result与旧canonical value不同且expected digest匹配
- **THEN** 新read model MUST返回不同resultDigest
- **AND** Application MUST不生成或递增持久revision

### Requirement: Task Review read model 必须独立于 Development 与 Finish
Task Review Application和GET MUST只读取Task Review current及history rows和Task identity，不读取Development、Candidate、Handoff、Finish或Terminal Delivery。

#### Scenario: 没有Development的Task
- **WHEN** Task存在Review Result但没有Development Receipt
- **THEN** inspect MUST正常返回两个slot
- **AND** MUST不产生Development missing diagnostic

#### Scenario: completed Task存在旧Finish association
- **WHEN** 旧Finish payload包含历史Review gate
- **THEN** Review页面 MUST不显示adopted或gate disposition
- **AND** 旧值只在Finish历史中保留

#### Scenario: 审查追加与历史读取
- **WHEN** 同一类型完成第三次审查且提交匹配的当前版本
- **THEN** inspect MUST返回该类型当前结果及按记录顺序排列的前两次完整结果和各自值摘要
- **AND** 另一个类型的当前与历史 MUST保持不变，历史不得被编辑或当作当前适用性结论

#### Scenario: 升级旧数据库
- **WHEN** 旧数据库只有当前审查结果且新增历史表迁移尚未执行
- **THEN** 只读检查 MUST返回当前结果和空历史且不写数据库
- **AND** 首次合法写入迁移后替换审查 MUST保留原当前结果；不得伪造更早的历史
