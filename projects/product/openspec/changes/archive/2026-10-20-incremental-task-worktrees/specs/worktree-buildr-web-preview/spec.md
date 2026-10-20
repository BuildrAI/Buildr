## ADDED Requirements

### Requirement: 安全追加工作树成员不得改变既有预览归属

同一任务（Task）安全追加工作树（Worktree）成员后，预览（Preview）MUST 通过同一任务（Task）、主工作空间（Canonical Workspace）、已有根目录、登记文件及原有成员路径和分支（Branch）的当前核验继续判断归属，MUST NOT 仅因 `planDigest` 改变而拒绝复用或停止。已有成员减少或身份变化 MUST 继续拒绝；停止仍须认证目标实例并保持原有资源边界。

#### Scenario: 新增来源后停止已有预览

- **WHEN** 当前完整集合扩展，原预览（Preview）记录的所有成员仍由当前事实核验为同一对象
- **THEN** 停止 MUST 继续通过归属核验，并只停止指定实例

#### Scenario: 追加失败但原预览成员有效

- **WHEN** 新增成员未创建成功，原预览（Preview）全部成员仍有效
- **THEN** 停止 MUST 允许依照有效成员核验原预览（Preview），不要求失败新增成员就绪

#### Scenario: 原有成员身份改变

- **WHEN** 同名记录的原有成员被移除、路径或分支（Branch）改变，或当前事实无法核验其身份
- **THEN** 预览（Preview）MUST 拒绝复用或停止，不把摘要变化本身当成安全追加证明
