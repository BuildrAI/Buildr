## MODIFIED Requirements

### Requirement: task-triage 必须输出正交且有证据的任务决策
Buildr 的 `task-triage` Skill MUST先核对任务相关事实，再分别判断语义治理和执行形态；输出 MUST包含选择、repository set、实际工作位置选择、最小依据、未决冲突和next provider/action，并 MUST只在适用时追加OpenSpec或正式Task状态。任务进度 MUST由对话、Task Record、Parent/Child与各专业公开read model表达，不得创建第二份Board或Environment authority。

#### Scenario: 已有契约的实现任务
- **WHEN** canonical spec已定义目标行为且Agent已核对当前checkout、repository/ref、owned scope与副作用
- **THEN** triage MUST选择`code-only + implementation`并允许直接工作
- **AND** MUST NOT仅因缺少Environment、Plan、Receipt或projection而阻塞编辑、构建或有界测试

#### Scenario: 实现任务需要独立Git位置
- **WHEN** Agent根据并发、隔离或用户要求决定使用Worktree
- **THEN** triage MUST把明确Workspace、Task ID、branch、start point与repository selectors交给Worktree provider
- **AND** MUST使用provider返回的实际checkout path继续工作，不得把Worktree evidence冒充统一Environment ready

#### Scenario: 独立收敛当前事实文档
- **WHEN** canonical specs、当前实现与registries已能确认现行事实，任务只让current knowledge追上该事实且不进入代码、构建或测试
- **THEN** triage MUST选择`spec-maintenance + metadata-only`
- **AND** MUST使用selected current-knowledge provider的`maintain` operation，不得为既有事实补造OpenSpec Change

#### Scenario: Authority 或执行范围不明确
- **WHEN** 可信事实源冲突、授权边界不明、repository set或实际工作位置无法确认
- **THEN** triage MUST返回`blocked`或`unknown`并提出改变长期语义所需的最少问题
- **AND** MUST NOT预先写入Change、代码、Task或任何位置记录

### Requirement: 实现型 workflow 必须绑定 task execution context
Buildr的Task Triage与OpenSpec Skills MUST在写入前核对实际Git checkout、Project/Service registry、owned scope和适用Worktree evidence。workflow MUST NOT要求matching Environment Receipt、统一`ready`、runtime projection或session adoption作为普通proposal、实现、构建、Review、Verification或交付前置。

#### Scenario: Triage 准备 Environment 后在原对话继续
- **WHEN** triage完成实际工作位置选择，且Agent已证明当前checkout或matching Worktree、branch/ref、dirty与owned scope适合本任务
- **THEN** workflow MUST在该真实位置继续并重新观察当前文件和Git事实
- **AND** MUST NOT创建空Environment、Plan或共享根占用记录

#### Scenario: 明确工作目录绑定 Environment
- **WHEN** matching Worktree evidence证明Task、Workspace、repository selector、checkout、branch和registration
- **THEN** workflow MUST只在对应checkout及其明确Project/Service根内写入
- **AND** evidence漂移只阻止依赖该位置的动作，不得撤销已成立的Review、Verification或Delivery

#### Scenario: Execution binding 漂移
- **WHEN** checkout、registry、Worktree evidence或owned scope任一冲突
- **THEN** workflow MUST停止对应写入并保留现场
- **AND** MUST NOT从cwd、分支名、路径相似、旧Receipt或相同HEAD猜测归属

#### Scenario: 只有 retained manager content identity 改变
- **WHEN** 实际checkout、Worktree evidence与owned scope仍匹配，但retained Buildr源码版本已经前进
- **THEN** workflow MUST按当前动作重新观察实际工具入口，不得自动改写Task checkout
- **AND** MUST NOT仅因旧Environment controller identity不同而失效Review、Verification或已成立Delivery

### Requirement: OpenSpec apply、sync 和 archive 必须使用单一 convergence authority
Buildr MUST在apply入口执行apply-ready、strict validation与proposal/delta门禁，并 MUST让独立sync/archive consumers拒绝canonical写入或归档旁路，统一转交`buildr openspec converge`。Convergence target MUST是Agent已核对的实际Change工作根，可以是当前Workspace或matching Worktree，不要求Task Environment。

#### Scenario: Apply 开始实现
- **WHEN** `openspec-apply-change`准备进行首个实现编辑
- **THEN** prepend MUST验证apply-required artifacts complete、上游strict validation、semantic preflight与实际工作根
- **AND**门禁未通过时 MUST blocked，delta Requirement identity或工作根发生变化后 MUST重新检查

#### Scenario: 用户直接调用 sync
- **WHEN**用户要求`openspec-sync-specs`在Buildr Workspace写入canonical specs
- **THEN**prepend MUST拒绝上游agent-driven sync并转用`buildr openspec converge`
- **AND**sync consumer MUST NOT要求Environment、旧研发或旧Finish状态

#### Scenario: 用户直接调用 archive
- **WHEN**用户要求`openspec-archive-change`跳过未完成tasks、spec sync或convergence直接归档
- **THEN**prepend MUST拒绝确认绕过并转用`buildr openspec converge`
- **AND**只有converge返回passed或幂等archived结果时才 MUST报告canonical sync/archive完成

### Requirement: 正式研发必须由 Agent 直接组合专业能力
Buildr MUST让Agent依据Task目标和真实现场按需组合实际工作位置、OpenSpec、Current Knowledge、Task Review、Task Verification、Git与默认`task-finish` Skill，MUST NOT要求Environment Receipt、统一`ready|blocked`、Development Receipt、Task Candidate或Development Handoff。

#### Scenario: 带OpenSpec的实现任务
- **WHEN** active Task在已核对的当前Workspace或matching Worktree中创建、实施并收敛OpenSpec Change
- **THEN** Agent MUST可直接完成strict validation、semantic preflight、实现、Current Knowledge、convergence、Review、Verification与交付
- **AND** 全程 MUST不创建Environment许可或研发聚合事实

#### Scenario: 内容变化后重新检查
- **WHEN** Review或Verification后真实内容变化
- **THEN** Agent MUST根据实际subject/content identity判断并重做受影响检查
- **AND** MUST不创建统一stale状态、候选代次或Environment恢复动作

### Requirement: 内置任务 Skills 只依赖实际需要的能力契约
Task Triage MAY按需消费Task Record、Git Operations、Current Knowledge与Worktree；task-finish MAY调用Task Record、Git Operations、Worktree和具体资源owner。Capability graph MUST不包含普通OpenSpec、Review、Verification或Finish对Task Environment的依赖。

#### Scenario: 解析任务能力图
- **WHEN** package或runtime解析内置Task/OpenSpec Skills
- **THEN** 每个consumer MUST只因实际动作需要而声明依赖
- **AND** Worktree、Preview或其他可选专业能力缺失 MUST只影响对应动作，不得扩大为全局阻塞
