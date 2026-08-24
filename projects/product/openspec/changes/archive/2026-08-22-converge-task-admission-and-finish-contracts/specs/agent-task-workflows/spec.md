## MODIFIED Requirements

### Requirement: 正式持久交付必须经过 Task Environment ready 门槛
Buildr task triage、OpenSpec contribution与正式执行入口 MUST把Task Environment ready门槛限制在实际消费Buildr-managed checkout、Preparation、runtime projection、Task-owned持久资源或正式环境证据的动作。Agent在用户已授权且repository、ref、owned scope与副作用明确时 MAY直接修改、构建或运行有界测试；该路径 MUST不生成或冒充Environment、Development、Review、Verification、Candidate、Finish或cleanup事实。采用受管环境后，planning、实现、Content Target观察、formal Verification与Candidate准备 MUST只发生在Receipt允许根。

#### Scenario: Triage 选择 Change Flow
- **WHEN** Task Record已建立且即将创建首份预计进入受管实现的OpenSpec artifact
- **THEN** Agent MUST先通过Task Environment准备或恢复实际执行位置
- **AND** 只有ready后才 MUST在允许根创建Change artifacts

#### Scenario: 直接命中 OpenSpec propose
- **WHEN** 用户意图直接命中installed `openspec-propose`且任务预计形成Buildr-managed持久交付
- **THEN** contribution MUST在`openspec new change`前核对Task与ready Environment
- **AND** MUST通过`task-environment`而非直接调用Git provider

#### Scenario: Code-only 实现
- **WHEN** 正式Task不需要OpenSpec Change但选择由Buildr管理checkout、依赖、runtime或正式证据
- **THEN** Agent MUST取得matching ready Environment
- **AND** MUST NOT因没有Change而跳过执行根、依赖与资源边界

#### Scenario: Formal Task 中直接工作
- **WHEN** 用户授权Agent在明确现有repository中直接修改、构建或运行有界测试，且不请求Buildr-managed Environment或正式Result
- **THEN** task-triage MUST允许该动作按Git、文件ownership和实际副作用边界推进，并把Environment准备保留为recommended选项
- **AND** MUST NOT创建虚假Receipt、把直接测试写成Formal Verification或把未登记资源交给Environment cleanup

#### Scenario: 只有 lifecycle metadata 写入
- **WHEN** 已有Task的Environment、Development、Review、Verification、Finish Skill只在canonical Workspace维护自己的Receipt或Result且不触发新环境效果
- **THEN** workflow MUST NOT为metadata写入重新准备已清理环境
- **AND** MUST保持各专业writer的canonical metadata authority

#### Scenario: Stable Content Target交给Task Verification
- **WHEN** Environment中的内容修改、Change convergence、current knowledge与受管生成资产已达到stable target
- **THEN** Task Development MUST观察完整Content Target并明确verification policy
- **AND** Task Verification MUST只绑定该Content Target、declarations、execution与evidence，不得拥有Candidate、policy或proceed

#### Scenario: Candidate 交给 Task Verification
- **WHEN** 旧consumer尝试把Candidate identity直接交给Task Verification
- **THEN** P0.5 workflow MUST拒绝该顺序，并先由Development观察stable Content Target、记录policy并完成formal Verification
- **AND** Task Verification MUST NOT接收、生成或持久化Candidate identity

### Requirement: Formal Task 启动必须优先使用 compact entry surface
Buildr内置task-triage与task-development guidance MUST在正式Task创建或恢复后优先读取Task Entry Snapshot，并只加载其current next action所指向的Skill、contract与provider。Snapshot MUST把缺少未被当前动作消费的Environment登记表达为`recommended`，只把继续会破坏current Development/Environment identity或产生受管副作用的前置表达为`required`；Agent MUST不把完整capability graph或下游lifecycle Skill列表当作启动依赖表。

#### Scenario: 创建 active Task 后启动
- **WHEN** Agent刚创建或恢复active formal Task，尚无Development current且没有matching Environment
- **THEN** Snapshot MUST返回可选择的Environment准备建议，并允许Agent选择仍满足实际owner contract的直接工作
- **AND** MUST不把缺少Plan、Receipt或projection报告成Workspace或Task全局不可用

#### Scenario: 当前受管事实依赖 Environment identity
- **WHEN** Development已绑定matching Environment，或当前动作请求受管checkout、Preparation、正式证据、持久资源、自动Finish或cleanup
- **THEN** Snapshot或实际owner MUST把Environment identity缺失、漂移或blocked表达为该动作的`required`前置
- **AND** MUST不允许Agent用cwd、聊天声明或旧Receipt替代current authority

#### Scenario: next action 改变
- **WHEN** 一次正式动作使Snapshot的typed next发生变化
- **THEN** Agent MUST按新next加载对应action-local contract或provider
- **AND** 之前未成为next的专业能力 MUST不因完整lifecycle预想而提前加载
