## ADDED Requirements

### Requirement: Formal Verification readiness 必须在稳定目标交接处只读派生
Task Development Application MUST在operation Result与compact projection中根据current Task Context Change dispositions、Content Target、verification policy与Verification gate派生response-only `formalVerificationReadiness`，并 MUST区分`not-applicable|blocked|unknown`。该摘要 MUST NOT写入Development Receipt、SQLite新slot、Candidate identity或专业Result；Task Development MUST NOT解释current knowledge正文或执行Formal Verification。

#### Scenario: Change仍pending时拒绝观察稳定目标
- **WHEN** `observe`提交的完整Change dispositions中至少一项为`pending`
- **THEN** Application MUST在Content Target observation与Receipt写入前返回稳定blocked诊断并保留原current Receipt
- **AND** MUST要求先完成对应Change的实现、checklist与deterministic convergence/archive，不得把pending内容标记为stable target

#### Scenario: 无Change或明确不适用
- **WHEN** code-only或Workspace-only Task提交空Change列表，或者全部关联Change均为可证明的`converged`或明确`not-applicable`
- **THEN** `observe` MUST继续按现有Content Target规则工作，不得因预检强制创建Change、knowledge sidecar或额外验证能力
- **AND** 开发期focused/affected反馈与Task外transient verification MUST不消费该readiness

#### Scenario: 已知交接事实尚未稳定
- **WHEN** Formal Verification尚未形成且Task Context存在pending Change，或Content Target、verification policy已知missing/stale
- **THEN** response-only readiness MUST为`blocked`或在尚未到交接阶段时为`not-applicable`，并列出Development-owned最小reason code
- **AND** typed next MUST不把该状态伪装成可直接执行的Formal Verification

#### Scenario: 已知事实就绪但current knowledge需即时确认
- **WHEN** Change dispositions已处置、Content Target与policy current且matching Formal Verification仍缺失
- **THEN** readiness MUST为`unknown`并把selected current knowledge provider的只读`inspect`作为recommended action-local next
- **AND** MUST不把unknown持久化、自动转为blocked或让Task Development推断provider结论

#### Scenario: 已有matching Formal Verification
- **WHEN** Task Development已消费与current Content Target和policy匹配的Verification Result
- **THEN** readiness MUST为`not-applicable`，后续next继续由Candidate/gate现有规则决定
- **AND** MUST不要求为了已完成的正式验证重复current knowledge inspect
