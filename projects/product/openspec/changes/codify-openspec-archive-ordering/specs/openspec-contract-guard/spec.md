# openspec-contract-guard 变更

## ADDED Requirements

### Requirement: 预归档检查在变基后的候选现场执行
Buildr MUST 将归档前的冲突预检定义为开发阶段收束动作：任务工作树变基到开发主线最新提交之后、正式 converge 之前执行 `buildr openspec convergence preflight`，并审查本 change delta 触及 capability 的主规格自主任务基点以来的变化。对变基前基线执行的 preflight 结果 MUST NOT 作为归档输入，也不得用于证明归档就绪。

#### Scenario: 变基后预检
- **WHEN** 任务实现与直接验证完成进入候选准备
- **THEN** Agent MUST 将任务工作树变基到开发主线最新提交，在新基线上执行预检，并对触及 capability 执行主规格漂移审查
- **AND** 漂移审查基于 `git diff <任务基点>..HEAD -- openspec/specs/<触及 capability>/`，diff 为空时直接继续

#### Scenario: 主规格漂移审查
- **WHEN** 触及 capability 的主规格在任务基点后发生变化
- **THEN** Agent MUST 对比本 change delta 与最新主规格语义
- **AND** 可判定本 change 是后继事实时继续；两个变更对同一 requirement 的意图不可共存时请求用户决定

#### Scenario: 冲突分类处理
- **WHEN** 预检或归档报告冲突
- **THEN** 基线陈旧（重新变基后消失）MUST 重新变基后重跑预检；delta 与最新主规格失配 MUST 回到 change artifacts 修订；同一 requirement 语义冲突 MUST 请求用户决定
- **AND** `recovery-unprovable` 类结果不属于上述分类，按 `buildr openspec convergence inspect` 的恢复口径处理

#### Scenario: 判断复用
- **WHEN** 收尾前开发主线未再前进，工作树仍为最新主线提交加本任务
- **THEN** Agent MUST 复用已有预检与漂移审查结果，不重复执行
- **WHEN** 收尾前需要重新变基
- **THEN** Agent MUST 重新执行预检与主规格漂移审查

## MODIFIED Requirements

### Requirement: 同步与归档必须保持动作边界
Buildr MUST保留独立同步与归档的区别；sync 接入 MUST NOT调用包含归档副作用的 converge。converge MUST只在归档属于授权目标时执行，inspect MUST只读取恢复现场。归档授权判定 MUST 委托任务收尾交付语义：用户要求收尾或明确要求归档时视为已授权归档，实现阶段自身 MUST NOT 默认触发归档。converge MUST 在变基到开发主线最新提交后的任务工作树上、集成进开发主线之前执行。

#### Scenario: 只要求同步
- **WHEN** 用户要求更新主规范并保留当前变更
- **THEN** 系统保持变更 active，不调用归档

#### Scenario: 收尾包含归档
- **WHEN** 用户要求收尾且任务包含已完成的 OpenSpec change
- **THEN** 归档视为已授权，在任务工作树内执行 converge，不单独重复请求归档授权

#### Scenario: 归档位置
- **WHEN** converge 执行
- **THEN** 它 MUST 以变基后任务工作树的实际输入执行，并在集成进开发主线之前完成
