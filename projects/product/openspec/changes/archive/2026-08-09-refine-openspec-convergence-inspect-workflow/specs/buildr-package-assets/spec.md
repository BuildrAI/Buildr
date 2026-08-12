## MODIFIED Requirements

### Requirement: 产品验证覆盖 OpenSpec 契约漂移门禁
Buildr 产品总验证 MUST覆盖deterministic convergence、事务期Convergence Inspect、上游兼容性和candidate tree的Canonical Specs变更关联。正常候选验证 MUST使用同一candidate中的Archived Change delta与canonical文件事实，不得要求tracked active/archive Convergence Receipt或创建替代审计记录。

#### Scenario: 门禁 fixture corpus
- **WHEN** 产品验证运行OpenSpec contract fixtures
- **THEN** 验证 MUST覆盖安全ADDED、MODIFIED、REMOVED和RENAMED收敛，以及未开始、before、expected、mixed/unknown和archived Inspect边界
- **AND** 验证 MUST覆盖proposal/delta不一致、active Change冲突、delta后改动、未触达Requirement被破坏、Receipt释放和归档后`not-applicable`

#### Scenario: Product candidate 修改 canonical specs
- **WHEN** Product Project的candidate Git tree包含canonical Requirement变化
- **THEN** 产品验证 MUST证明每个变化capability能够关联到同一candidate中归档Change的delta语义，并要求`openspec validate --all --strict`通过
- **AND** 缺少对应Archived Change、delta与canonical事实不匹配或只有strict validation通过 MUST被拒绝

#### Scenario: Candidate不包含Convergence Receipt
- **WHEN** 正常Converge已成功归档并释放本次Receipt
- **THEN** 产品候选与package验证 MUST在没有tracked Convergence Receipt时通过既有Archived Change/canonical门禁
- **AND** MUST NOT扫描Worktree外路径、恢复已清理Receipt或把Receipt复制到新的store

#### Scenario: OpenSpec Component 上游升级
- **WHEN** package中声明的OpenSpec upstream version变化
- **THEN** package check和产品验证 MUST对该版本运行contract fixture corpus
- **AND** 未经支持或fixture失败 MUST阻止package verification通过

#### Scenario: Runtime 投射门禁 Skill
- **WHEN** 临时Workspace初始化、update或sync支持的Agent runtime
- **THEN** 产品E2E MUST验证`openspec-contract-guard`随OpenSpec Component物化并投射
- **AND** OpenSpec Component被显式卸载时该Skill MUST随集合安全移除

#### Scenario: Runtime 组合和移除门禁 Contribution
- **WHEN** 临时Workspace对支持的Agent安装或卸载OpenSpec Component
- **THEN** 产品E2E MUST验证安装后的workflow Skills获得current Converge/Convergence Inspect边界
- **AND** 卸载后 MUST不残留Buildr-owned contribution或旧`openspec audit`调用
