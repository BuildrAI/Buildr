## MODIFIED Requirements

### Requirement: Release生命周期动作必须独立授权且幂等
Release create、update、freeze、reopen、abandon和cleanup MUST分别核验current identity、owner与授权，MUST报告实际effects，且 MUST按用户已授权的任务范围执行正常动作和同身份可逆恢复，不重复索取确认。重复调用只有在输入和live facts等价时才可返回幂等成功；正式远端release branch删除 MUST要求独立明确授权，已授权的本任务临时载体清理 MUST允许安全续接。

#### Scenario: 冻结current release
- **WHEN** 维护者要求对current release HEAD/tree形成Candidate
- **THEN** freeze MUST返回selection chain、release commit/tree、generation与历史freeze identity，并准确报告本地lifecycle ref effects
- **AND** release内容变化 MUST使旧freeze、Candidate、artifact、readiness和transaction context stale

#### Scenario: 重新打开失败Candidate对应的冻结集合
- **WHEN** 维护者已经从GitHub、Git tag、npm registry与protected workflow current facts确认尚无公开或不可逆publication，且重新打开current frozen release位于用户已授权的修复范围
- **THEN** release workflow MUST独立调用reopen，selection owner MUST核验current identity、授权范围与修复原因、保留历史freeze ref并释放current freeze
- **AND** reopen MUST不隐含update、remote push、Candidate执行、Task状态变化或公共发布副作用

#### Scenario: 已存在公开发布事实
- **WHEN** 目标version/tag/GitHub Release已经存在，或matching protected transaction已经开始tag、npm或GitHub Release公共mutation
- **THEN** release workflow MUST拒绝reopen并要求选择新version
- **AND** selection owner MUST NOT通过caller提交的publication布尔值、历史stdout或Task completed状态补造安全证明

#### Scenario: 放弃未发布集合
- **WHEN** 维护者明确放弃某个尚未公开发布的release集合
- **THEN** abandon MUST保留Task、Verification、Finish和Git已有事实并阻止该集合继续进入Candidate/publication
- **AND** MUST NOT自动删除local/remote ref或伪造cleanup成功

#### Scenario: 清理远端release branch
- **WHEN** 公开发布与恢复价值已核验完成且remote release ref仍存在
- **THEN** owner MUST展示精确ref、commit与已成立发布事实并等待独立删除授权
- **AND** 未获授权、ref漂移或ownership不可证明时 MUST保留remote ref

### Requirement: 共享 Release Context 必须只组合current owner facts

Buildr MUST使用唯一closed builder组合release selection、release HEAD/tree、Product Candidate aggregate、冻结artifact、main/dev、Task correlation、matching Worktree evidence、最低充分执行环境观察、exact Node与publish workflow identity。Builder MUST直接读取当前事实并自动组合输入，不要求智能体复制绑定JSON或计算摘要；历史准备绑定仅用于读取兼容，MUST NOT要求重复npm ci形成新绑定。Builder MUST NOT读取Task Environment ready、Plan、Receipt或runtime投影。

#### Scenario: 构造完整dispatch context
- **WHEN** active release Task、matching Worktree、最低充分执行环境观察、Candidate、artifact、Git与Node事实全部current
- **THEN** Release MUST形成不含Environment字段的current context

#### Scenario: 专业事实缺失或漂移
- **WHEN** 任一必需owner fact缺失、stale、schema不受支持或与release source不一致
- **THEN** builder MUST保留可读取的其他owner projection并形成对应finding输入
- **AND** MUST NOT从Task状态、历史stdout、文件路径、caller assertion或旧Environment数据补造缺失成功

## REMOVED Requirements

### Requirement: 失败候选修复必须通过全绿演练原子提升
**Reason**: 跨本地Git与远端Git不是原子事务；强制演练后再完整候选造成重复。
**Migration**: 使用同一候选验证入口及分阶段选择纳入；满足精确源码、产物和执行输入的演练直接复用完整结果。

## ADDED Requirements

### Requirement: 发布选择和恢复必须报告分阶段真实效果
发布工具 MUST在任何本地提交、引用更新、远端推送和结果回读之间保存已发生效果；失败返回 MUST区分已确认成功、已确认未发生与未知，MUST NOT用空effects掩盖已完成动作。相同目标恢复 MUST先回读本地与远端真实事实，仅补齐未完成动作；冲突 MUST保留现场。

#### Scenario: 本地写入成功但远端失败
- **WHEN** 本地发布分支和冻结引用已更新，远端推送失败
- **THEN** Result MUST保留本地已完成引用与远端失败事实
- **AND** 同目标重试 MUST复用本地状态并继续推送，不要求旧基线仍是当前HEAD

#### Scenario: 远端写入成功但响应丢失
- **WHEN** 推送返回错误或后续回读失败，远端可能已接收目标提交
- **THEN** Result MUST标记远端未确认并允许同目标回读恢复
- **AND** 回读匹配后 MUST复用，不重建提交、不覆盖其他目标

#### Scenario: 部分引用或结果回读失败
- **WHEN** 多阶段引用操作只完成一部分或写入后的检查失败
- **THEN** Result MUST保留已确认的逐项效果和唯一恢复动作
- **AND** 本地引用集合 MUST使用条件事务更新，跨系统阶段 MUST不宣称全局原子性

### Requirement: 发布内容身份必须与引用名称和无关登记解耦
Release MUST将dev、origin/dev和完整SHA解析为精确提交，分别记录输入名称、实际提交及远端观察。冻结基线和有序来源 MUST不自动追随dev；相同提交的不同拼写 MUST不改变选择内容身份。任务数据 MUST从明确canonical Workspace读取，Git操作 MUST在matching execution root执行。

#### Scenario: 引用名称不同但提交相同
- **WHEN** dev、origin/dev或完整SHA解析到同一提交
- **THEN** 内容身份与验证复用判断 MUST相同
- **AND** 相同拼写解析到不同提交时 MUST报告真实差异并校验来源关系

#### Scenario: 工作树与任务工作空间分离
- **WHEN** 发布代码在工作树运行且任务记录位于canonical Workspace
- **THEN** 工具 MUST自动组合matching工作树事实并从canonical Workspace读取任务
- **AND** MUST不在执行目录创建或推断第二份任务数据

### Requirement: 精确候选结果必须可直接作为最终验证
完整候选结果 MUST绑定精确源码提交、产物字节与清单、检查配方、锁文件、Node和平台等相关执行输入。匹配的完整演练或候选 MUST允许直接复用；用途标签、任务登记或临时载体变化 MUST不导致重新构建和全量执行。

#### Scenario: 全绿演练被纳入同一源码
- **WHEN** 已验证源码和产物未变，纳入后的相关输入全部匹配
- **THEN** 最终准备 MUST复用同一完整aggregate和tarball
- **AND** MUST重新核验当前选择、main关系及临发布公开状态，而不重新pack

#### Scenario: 源码或相关执行条件变化
- **WHEN** 源码提交、产物字节、工具链、配方或相关平台条件变化
- **THEN** 工具 MUST说明失效证明范围并重新验证
- **AND** 内嵌源码身份变化 MUST重新构建，不能只凭tree相同复用旧包
