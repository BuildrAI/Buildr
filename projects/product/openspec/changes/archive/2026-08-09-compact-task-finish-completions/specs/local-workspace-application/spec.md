## MODIFIED Requirements

### Requirement: Local App 必须以 Application terminal projection 展示 Task 交付事实
Local App Task详情 MUST保持“概览、研发、证据、复盘、环境”五个一级页签，并 MUST只通过Application read model获取current/terminal facts。“概览”MUST调用Task Overview Application的一次SQLite联表读取；其他页签MUST继续调用所属专业Application reader。HTTP/Web MUST NOT直接读取SQLite、扫描Finish JSON、计算live identity、接受target/root/path filesystem query或依赖独立lifecycle projection；Terminal Delivery Application MUST只查询Task、Development与唯一Finish current保存事实。

#### Scenario: completed delivered Task
- **WHEN** terminal projection返回delivered
- **THEN** 研发页主结论 MUST显示“已交付”，并展示交付时Task context、planning disposition、Content Target、verification policy、Candidate/generation与Development handoff
- **AND** MUST展示final commit/ref、完成时间与Environment cleanup为正常结果
- **AND** GET MUST NOT扫描Finish Result、恢复Environment或观察Git

#### Scenario: completed noChange Task
- **WHEN** Task completed且result.noChange为true
- **THEN** 页面 MUST显示“已完成，无需交付变更”
- **AND** MUST NOT要求或伪造Finish Result

#### Scenario: completed Task 缺少匹配 Finish
- **WHEN** Task completed、非noChange且Finish terminal current没有matching association
- **THEN** 页面 MUST显示“已完成，但交付未经证明”
- **AND** MUST NOT使用delivered的绿色成功语义或从其他来源补造

#### Scenario: terminal 证据视图
- **WHEN** terminal projection从Finish terminal current返回Review/Verification delivery association
- **THEN** 证据页 MUST使用“已随交付候选采用”与“已随交付目标验证通过/未通过”等交付时文案
- **AND** MUST将active保存值匹配关系与terminal association分开表达，不得在读取时重算live applicability

#### Scenario: 技术详情与单卡宽度
- **WHEN** 页面展示SHA、digest、`workspace-sqlite:` locator或单一Verification Result
- **THEN** 技术标识 MUST位于次要或可展开详情，Verification单卡 MUST使用合理最大宽度
- **AND** Agent生成的原始evidence内容 MUST保持原文，不由Web翻译或改写

Task Finish MAY请求Development Application针对一个允许的carrier root重观测complete Content Target，但MUST NOT创建Candidate。只有carrier Content Target与handoff Candidate绑定的target逐component相等且Task context/policy仍current时，Application MUST返回equivalent；否则MUST返回Development handoff失效。上述Finish动作完成后 MUST写入Finish terminal association；读取terminal Task时不得重新执行该重观测。

#### Scenario: 只增加delivery commit
- **WHEN** Finish机械提交当前内容但所有scope bytes与逻辑语义未变化
- **THEN** carrier equivalence MUST通过且Candidate identity保持不变
- **AND** commit、branch与ref MUST不进入Content Target或Candidate identity

#### Scenario: carrier prepare改变内容
- **WHEN** rebase、sync、archive、生成或冲突处理改变任一component identity
- **THEN** equivalence MUST失败并判定current handoff失效
- **AND** Finish MUST退出到Development重新验证和生成Candidate

### Requirement: Local App 必须通过 Task Finish Application 投影 current 与 terminal 状态
Terminal Delivery Application MUST从Workspace SQLite中的唯一`task_finish_current` authority形成read model；Local App HTTP/Web MUST只消费该Application结果，不得直接查询SQLite、读取phase detail、扫描或配对legacy Finish files、读取transient diagnostics、恢复run、计算live identity或读取lifecycle projection。terminal delivered判断 MUST只使用同Task且与保存Development handoff匹配的compact terminal association；非terminal current row只用于展示进行中、blocked、failed或cleanup pending状态。

#### Scenario: Finish 正在执行
- **WHEN** Task存在非terminal Finish current row
- **THEN** Local App MUST展示current phase、有界状态、更新时间与唯一next action
- **AND** MUST NOT把Task显示为delivered、读取完整stdout/stderr或触发resume

#### Scenario: Finish cleanup pending
- **WHEN** delivery已证明但Environment或Finish-owned cleanup尚未完成
- **THEN** Local App MUST显示“交付清理中”或匹配的blocked状态
- **AND** MUST NOT提前显示Task completed或terminal delivered成功语义

#### Scenario: Finish terminal completion
- **WHEN** Application返回与Task/Development保存identity匹配且`status: complete`的compact terminal current association
- **THEN** Local App MUST以其commit/ref、remote readback、Doctor、cleanup与完成时间投影“已交付”
- **AND** GET MUST不访问Git、remote、Environment provider、旧四表、legacy files、transient root或已删除lifecycle table

#### Scenario: legacy store 残留
- **WHEN** `.buildr/task-finish`仍存在但SQLite中没有matching terminal current
- **THEN** Local App MUST不扫描、不读取、不把legacy文件当作交付authority
- **AND** MUST只展示SQLite-backed Application read model；旧目录清理由升级步骤负责
