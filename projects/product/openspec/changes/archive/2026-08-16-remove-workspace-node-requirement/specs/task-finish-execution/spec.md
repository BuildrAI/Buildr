## REMOVED Requirements

### Requirement: Task Finish 必须冻结并核验 Workspace Node identity
**Reason**: Finish不应被与任务内容无关的Organization Workspace Node阻塞。
**Migration**: 新run不生成Node identity或漂移检查；旧字段允许读取并忽略，需要继续执行的旧active run重新准备。

#### Scenario: Finish 运行中 Node identity 漂移
- **WHEN** Finish执行期间环境中的Node发生变化
- **THEN** Finish MUST仅按真实声明的命令结果和既有handoff authority判定，不得读取Workspace Node identity

## MODIFIED Requirements

### Requirement: Code-only run 必须完全省略Change authority
Task Finish MUST对无Changehandoff完全省略Change tasks、knowledge impact、OpenSpec plan/check/convergence/archive operations，MUST NOT新增`candidateKind`或`changeContext`字段重新拥有分类。结果与completion evidence MUST包含Task、Candidate、handoff、Content Target与carrier identity。

#### Scenario: Code-only preflight
- **WHEN** preflight处理code-only handoff
- **THEN** Environment/CLI、Development handoff、Git/target与retained readiness MUST正常检查
- **AND** MUST不执行或伪造Change/OpenSpec checks

#### Scenario: Code-only prepare
- **WHEN** code-only run进入prepare
- **THEN** prepare MUST只形成内容等价carrier并调用Development equivalence
- **AND** command observations MUST证明没有调用OpenSpec executable

#### Scenario: Code-only completion
- **WHEN** code-only run完成deliver与cleanup
- **THEN** durable completion MUST记录task、handoff/Candidate/Content Target identity、carrier ref和目标分支
- **AND** MUST不创建Change context或not-applicable占位来重新解释Development语义

### Requirement: Task Finish Result 必须报告只读解析上下文
`buildr.task-finish-result/v2` MUST以additive `resolvedContext`报告本次run从既有Task、Development handoff、Environment和delivery target事实中解析出的最小上下文，包括`buildr.task-finish/v1` capability identity、Task/handoff/Candidate/Content Target identity、Agent、target branch、remote与该集合的确定性identity。`resolvedContext` MUST只由产品生成，不得作为run输入、可编辑execution capsule、独立数据库列、Receipt、恢复manifest或第二authority。

#### Scenario: 新run形成解析上下文
- **WHEN** `task finish run`通过入口readiness并创建新的Finish run
- **THEN** run与后续inspect/terminal Result MUST返回由同一run identity确定性形成的`resolvedContext`
- **AND** 调用方 MUST不需要提交contract版本、handoff、Environment、Candidate或delivery plan

#### Scenario: inspect读取terminal Result
- **WHEN** 调用方按run id inspect已完成或blocked的Finish Result
- **THEN** `resolvedContext` MUST与该run采用的identity保持一致
- **AND** reader MUST NOT重新解释当前Task、Environment或后续变化来改写历史解析上下文

#### Scenario: 读取缺少字段的既有v2 Result
- **WHEN** Workspace中存在本变更前写入且没有`resolvedContext`的合法`buildr.task-finish-result/v2`
- **THEN** 兼容reader MUST允许该字段为null或按已保存run identity只读派生
- **AND** MUST NOT迁移历史Result、建立补写任务或把缺失字段解释为交付失败
