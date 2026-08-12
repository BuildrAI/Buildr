## MODIFIED Requirements

### Requirement: Task 详情必须只读投影 current Verification Result
本机应用 MUST在Task详情“证据”视图提供“验证结果（Verification Result）”区块，并 MUST通过Task Verification Application inspect展示Result presence、target、declarations、实际capability facts、coverage gaps、结论、resultDigest、record observedAt，以及与Development gate/显式保存identity的匹配关系。页面 MUST不直接读取Result YAML，不得伪造当前target identity，也不得暴露Result writer；GET MUST只查询SQLite专业current rows，不执行declaration、Content Target、Git或Environment observation。

#### Scenario: 查看已有 Result
- **WHEN** 用户打开Task的“证据”视图
- **THEN** API MUST返回Application的current read model并设置no-store
- **AND** 验证结果区块 MUST显示Result保存事实、record observedAt与保存identity的matched/mismatched/unknown关系
- **AND** GET MUST NOT执行declaration、Git、文件或Environment observation

#### Scenario: Result 不存在
- **WHEN** Task尚无current Verification Result
- **THEN** 验证结果区块 MUST显示空状态与“交给Agent验证”的动作
- **AND** Task Record、Environment、Development、Review与其他视图 MUST正常工作

#### Scenario: lifecycle snapshot 不存在
- **WHEN** Task有current Verification Result但没有保存Development verification gate
- **THEN** 验证结果区块 MUST显示已有Result与稳定unknown/not-adopted-yet关系
- **AND** GET MUST NOT为了补齐关系修改数据库、扫描外部声明或创建Development Receipt

#### Scenario: 尝试直接写 Result API
- **WHEN** 客户端向Task verification resource发送POST/PUT/PATCH/DELETE
- **THEN** 本机应用 MUST不提供该路由
- **AND** Task Record、Environment、Development、Review与已有Result bytes MUST保持不变

### Requirement: Local App 必须以 Application terminal projection 展示 Task 交付事实
Local App Task详情 MUST保持“概览、研发、证据、复盘、环境”五个一级页签，并 MUST只通过Application read model获取current/terminal facts。“概览”MUST调用Task Overview Application的一次SQLite联表读取；其他页签MUST继续调用所属专业Application reader。HTTP/Web MUST NOT直接读取SQLite、扫描Finish JSON、计算live identity、接受target/root/path filesystem query或依赖独立lifecycle projection；Terminal Delivery Application MUST只查询Task、Development与Finish current/completion保存事实。

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
- **WHEN** Task completed、非noChange且Finish completion没有matching association
- **THEN** 页面 MUST显示“已完成，但交付未经证明”
- **AND** MUST NOT使用delivered的绿色成功语义或从其他来源补造

#### Scenario: terminal 证据视图
- **WHEN** terminal projection从Finish completion返回Review/Verification delivery association
- **THEN** 证据页 MUST使用“已随交付候选采用”与“已随交付目标验证通过/未通过”等交付时文案
- **AND** MUST将active保存值匹配关系与terminal association分开表达，不得在读取时重算live applicability

#### Scenario: 技术详情与单卡宽度
- **WHEN** 页面展示SHA、digest、`workspace-sqlite:` locator或单一Verification Result
- **THEN** 技术标识 MUST位于次要或可展开详情，Verification单卡 MUST使用合理最大宽度
- **AND** Agent生成的原始evidence内容 MUST保持原文，不由Web翻译或改写

Task Finish MAY请求Development Application针对一个允许的carrier root重观测complete Content Target，但MUST NOT创建Candidate。只有carrier Content Target与handoff Candidate绑定的target逐component相等且Task context/policy仍current时，Application MUST返回equivalent；否则MUST返回Development handoff失效。上述Finish动作完成后 MUST写入Finish completion association；读取terminal Task时不得重新执行该重观测。

#### Scenario: 只增加delivery commit
- **WHEN** Finish机械提交当前内容但所有scope bytes与逻辑语义未变化
- **THEN** carrier equivalence MUST通过且Candidate identity保持不变
- **AND** commit、branch与ref MUST不进入Content Target或Candidate identity

#### Scenario: carrier prepare改变内容
- **WHEN** rebase、sync、archive、生成或冲突处理改变任一component identity
- **THEN** equivalence MUST失败并判定current handoff失效
- **AND** Finish MUST退出到Development重新验证和生成Candidate

### Requirement: Local App 必须通过 Task Finish Application 投影 current 与 terminal 状态
Terminal Delivery Application MUST从Workspace SQLite中的Task Finish current/completion repository形成read model；Local App HTTP/Web MUST只消费该Application结果，不得直接查询SQLite、扫描或配对legacy Finish files、读取transient diagnostics、恢复run、计算live identity或读取lifecycle projection。terminal delivered判断 MUST只使用同Task且与保存Development handoff匹配的compact completion association，current run只用于展示进行中、blocked或cleanup pending状态。

#### Scenario: Finish 正在执行
- **WHEN** Task存在SQLite current run且尚无terminal completion
- **THEN** Local App MUST展示当前phase、有界状态、更新时间与唯一next action
- **AND** MUST NOT把Task显示为delivered、读取完整stdout/stderr或触发resume

#### Scenario: Finish cleanup pending
- **WHEN** delivery已证明但Environment或Finish-owned transient cleanup尚未完成
- **THEN** Local App MUST显示“交付清理中”或匹配的blocked状态
- **AND** MUST NOT提前显示Task completed或terminal delivered成功语义

#### Scenario: Finish terminal completion
- **WHEN** Application返回与Task/Development保存identity匹配的compact completion association
- **THEN** Local App MUST以其commit/ref、remote readback、Doctor、cleanup与完成时间投影“已交付”
- **AND** GET MUST不访问Git、remote、Environment provider、legacy files、transient root或已删除lifecycle table

#### Scenario: legacy store 残留
- **WHEN** `.buildr/task-finish`仍存在但SQLite中没有matching completion
- **THEN** Local App MUST不扫描、不读取、不把legacy文件当作交付authority
- **AND** MUST只展示SQLite-backed Application read model；旧目录清理由升级步骤负责
