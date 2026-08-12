## ADDED Requirements

### Requirement: Task verification 必须表达前序 evidence 的失效原因与替代关系
当 consumer 因 implementation change、target branch race 或 verification failure 对新 candidate 再次调用 task-verification provider 时，provider MUST 在输入可验证的前序 evidence reference 存在时返回本次 run 与前序 run 的替代关系、失效原因和当前 candidate identity。Provider MUST 保持每次 run 的独立 wall-clock，不得把多个 run 合并为一个虚构验证结果。

#### Scenario: Consumer 提交 implementation-changed 失效原因
- **WHEN** Task Finish 对 rebase、冲突解决、生成资产更新或其他实现变化后的 candidate 请求相同 required assurance
- **THEN** provider MUST 将新 evidence 绑定新 candidate identity
- **AND** result MUST 引用被替代 evidence 和 `implementation-changed` 原因

#### Scenario: Consumer 提交 target-race 失效原因
- **WHEN** 最终保证后远端目标 ref 变化并触发新的 convergence/rebase
- **THEN** provider MUST 接受 `target-race` 作为旧 evidence 不可复用的来源事实
- **AND** MUST NOT 把旧 run 的成功状态继承到新 candidate

#### Scenario: 前序验证失败后重新执行
- **WHEN** 前序 run 失败且 consumer 在修复后提供失败 evidence reference
- **THEN** 新 result MUST 标识 superseded failed run、失败项和新 run reference
- **AND** 新 run 的 `totalDurationMs` MUST 只表示本次真实 wall-clock

### Requirement: Verification policy 必须识别 archive-sensitive coverage 信号
当任务修改 Change lifecycle、Change path resolution、OpenSpec sync/archive workflow 或直接读取 active/archived Change 资产时，task-verification provider MUST 把它作为 archive-sensitive coverage 信号交给当前 Project policy。Provider MUST 选择已声明且适用的 active/archive capability，或明确报告 coverage gap；不得把 OpenSpec archive rehearsal 等同于应用层测试覆盖。

#### Scenario: Project 声明 active/archive contract coverage
- **WHEN** affected paths 命中 Change lifecycle 且 Project policy 提供适用的 stable active/archive capability
- **THEN** provider MUST 将该 capability 纳入 affected 或 Candidate 的 selected capabilities
- **AND** evidence MUST 说明 active 与 archived 状态的覆盖结果

#### Scenario: Project 没有声明 archive-sensitive capability
- **WHEN** 任务命中 archive-sensitive signal 但当前 Project policy 和 legacy discovery 均无法确认对应测试
- **THEN** provider MUST 在 coverage summary 中披露 gap
- **AND** MUST NOT 因 OpenSpec rehearsal 成功而宣称应用 read model、测试 fixture 或路径解析已覆盖

#### Scenario: 自举测试引用正式 Change
- **WHEN** Buildr Product contract test 读取一个可能归档的正式 Change
- **THEN** 测试 MUST 解析 active identity 或唯一 archived identity
- **AND** MUST NOT 将 active-only 固定路径作为长期通过条件
