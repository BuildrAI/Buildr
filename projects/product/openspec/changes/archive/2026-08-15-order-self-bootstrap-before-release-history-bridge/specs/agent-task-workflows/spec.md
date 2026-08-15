## MODIFIED Requirements

### Requirement: squash 发布候选以 tree identity 幂等衔接回 dev
Buildr Product Project 的发布引导 MUST 在 matching release Task Finish 的 self-bootstrap activation 已完成或确定不适用、activation 后的 `dev` tree 已成为正式候选，并且 `dev -> main` 发布 PR squash merge 后，以该已验证候选的 Git tree identity 为内容门禁，将 squash `main` 的历史幂等衔接回 `dev`。

#### Scenario: Finish 后先完成 self-bootstrap activation
- **WHEN** release Task Finish 已把候选交付到 `dev`
- **THEN** Agent MUST 在 pre-main convergence、`dev -> main` PR 和任何发布历史衔接之前，以 matching Finish run 调用唯一 `buildr-self-bootstrap-sync` runner
- **AND** runner MUST 返回同一 run 的 `passed` 或带完整 plan 的 `not-applicable` evidence
- **AND** Agent MUST 在 activation 后重新读取 `origin/dev` commit/tree，并把该 tree identity 用于后续 pre-main convergence、Candidate gate 与 history bridge
- **AND** runner blocked、failed、run/ref 不匹配或 evidence 不完整时 Agent MUST 停止发布准备
- **AND** Agent MUST NOT 先创建 history bridge 再补跑、绕过或放宽 runner

#### Scenario: squash 后候选 tree 完全一致
- **WHEN** `dev -> main` 发布 PR 已按仓库策略 squash merge
- **AND** `origin/main^{tree}` 与 activation 后已通过完整验证的 candidate tree identity 相同
- **AND** `origin/dev^{tree}` 与该 candidate tree identity 相同
- **AND** history bridge 已验证同一 Finish run 的 self-bootstrap closeout evidence
- **THEN** Agent MUST 将 `origin/main` 的历史衔接到 `dev`
- **AND** 衔接 commit MUST 保持与 candidate tree identity 相同的 Git tree
- **AND** Agent MUST 普通 push `dev` 并确认远端 `dev` 包含该衔接
- **AND** Agent MUST NOT 仅因 squash commit 或衔接 commit 的 commit identity 不同而重复执行已通过的完整候选验证

#### Scenario: self-bootstrap evidence 缺失或不匹配
- **WHEN** history bridge 没有收到 closeout evidence
- **OR** evidence schema、status、Finish run、Task、remote、target branch、plan、finalize phase 或推导出的最终 `dev` ref 与当前发布事实不匹配
- **THEN** bridge MUST 在 merge、commit 和 push 前失败关闭
- **AND** bridge MUST 保持本地候选与远端 refs 不变
- **AND** Agent MUST 回到 matching Finish run 的 self-bootstrap activation 诊断，不得把当前 tree 相同冒充 activation 已完成

#### Scenario: main 已是 dev 祖先
- **WHEN** Agent 准备执行 squash 后历史衔接
- **AND** matching self-bootstrap closeout evidence 已验证
- **AND** `origin/main` 已是 `origin/dev` 的祖先
- **THEN** Agent MUST 将历史衔接视为已完成
- **AND** Agent MUST NOT 重复创建历史衔接 commit

#### Scenario: squash 结果与已验证候选 tree 不一致
- **WHEN** `origin/main^{tree}` 或 `origin/dev^{tree}` 与 activation 后记录的 candidate tree identity 不同
- **THEN** Agent MUST 停止自动历史衔接、push 和后续 tag 动作
- **AND** Agent MUST 报告实际 tree identity、预期 candidate tree identity 和需要重新评估的 ref
- **AND** Agent MUST NOT 使用 `ours` merge、force push、reset 或其他历史操作掩盖内容差异

#### Scenario: 远端 ref 在衔接前发生竞争更新
- **WHEN** evidence/tree identity 检查后、历史衔接或 push 前 `origin/main` 或 `origin/dev` 不再指向已检查的 ref
- **THEN** Agent MUST 停止尚未执行的历史衔接和 push
- **AND** Agent MUST 重新 fetch 并从 self-bootstrap evidence 与 tree identity 门禁开始重新评估

#### Scenario: 发布授权覆盖发布专用历史衔接
- **WHEN** 用户当前轮次明确要求准备 Buildr 候选版或稳定版
- **AND** matching self-bootstrap closeout evidence 与历史衔接的 tree identity 门禁已通过
- **THEN** Buildr Release Skill MAY 自动创建仅衔接 squash `main` 历史且不改变 tree 的 merge commit
- **AND** 该授权 MUST NOT 扩展为通用 Git Ops 或 Task Finish 的 merge commit 授权
- **AND** 该授权 MUST NOT 包含 force push、改写共享分支历史或解决内容冲突
