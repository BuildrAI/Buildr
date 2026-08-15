## ADDED Requirements

### Requirement: 协作者更新必须与本地 self-bootstrap activation 排他路由
Buildr Agent workflow MUST 将已检出 canonical Workspace 因远端协作者提交而前进、但当前会话不存在与该更新匹配的 Formal Finish Result 的情况归类为普通 Workspace update。Agent MUST 使用 Git transition evidence 与当前 Doctor findings 路由既有 Buildr workspace sync，不得从 commit author、缺失本地 Task、HEAD、dirty tree 或 runtime drift 反推 self-bootstrap activation；`buildr-self-bootstrap-sync` MUST 只消费匹配的 Formal Finish Result/run。

#### Scenario: 协作者提交使 canonical tree 前进且本地没有匹配 Finish
- **WHEN** selected Git provider 已证明 canonical Workspace 的 checkout 因 `origin/dev` 上的提交而 `treeChanged: true`
- **AND** 当前会话不存在绑定该 Workspace、Task、run 与 delivered ref 的 matching Formal Finish Result
- **THEN** Agent MUST 将该状态归类为普通 Workspace update，并运行当前 Agent 的 post-transition Doctor
- **AND** 本地没有该协作者 Task MUST 被视为正常事实，不得作为异常、回滚或 self-bootstrap 依据
- **AND** Agent MUST NOT 启动 `buildr-self-bootstrap-sync`

#### Scenario: 协作者更新只造成当前 Agent managed projection stale
- **WHEN** 普通 Workspace update 后的 Doctor 仅将 actionable findings 归因于当前 Agent 的 managed workspace 或 runtime projection stale
- **THEN** Agent MUST 通过产品入口 Buildr Skill 路由 `buildr sync <agent> --target <workspace-root>`
- **AND** 用户已明确要求更新或同步 workspace 时 MUST 复用该授权，否则 MUST 按既有 workspace transition 契约取得一次同步确认
- **AND** sync 的最终 Doctor MUST 成为本次环境收敛证据

#### Scenario: Doctor 报告非 workspace sync blocker
- **WHEN** 普通 Workspace update 后的 Doctor 同时或单独报告不能由 workspace sync 正确处理的 CLI、Component、Command、Git 或其他 blocker
- **THEN** Agent MUST NOT 把一次 sync 宣称为完整修复
- **AND** Agent MUST 按对应 authority 的下一动作处理或停止并请求所需授权

#### Scenario: 当前会话存在 matching Formal Finish Result
- **WHEN** 当前会话持有绑定同一 canonical Workspace、Task、run、delivered ref 与 Environment retained Node 的 eligible Formal Finish Result
- **THEN** Buildr 自举 Workspace MAY 按 `buildr-self-bootstrap-sync` 的既有 contract 执行唯一 runner
- **AND** 普通 Workspace update 路由 MUST NOT替代、伪造或修改该 Finish Result

#### Scenario: workspace sync 不产生 Task 或 Finish authority
- **WHEN** Buildr Skill 为协作者更新执行 workspace sync
- **THEN** sync MUST 只收敛 workspace destination 与当前 Agent runtime 并返回最终 Doctor
- **AND** sync MUST NOT 创建 Task、Environment、Verification、Candidate、Finish Result 或 self-bootstrap evidence
