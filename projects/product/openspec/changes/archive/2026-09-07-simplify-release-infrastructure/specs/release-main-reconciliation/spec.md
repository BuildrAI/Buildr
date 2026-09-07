## MODIFIED Requirements

### Requirement: reconciliation 必须使下游发布证据按 generation 重建
Buildr MUST只允许完成current main coverage与历史收敛后的最终release generation进入完整Product Candidate。只有Reconciliation改变release commit或相关验证输入时，即使tree保持不变，也 MUST使旧Candidate aggregate、tarball、readiness context、carrier与release→main PR source失效，并 MUST从新的generation重新创建matching Candidate、唯一artifact、readiness与carrier。相同输入且live readback完全一致时 MUST支持幂等复用。

#### Scenario: reconciliation 后旧 Candidate 仍存在
- **WHEN** 历史run或迁移中的Candidate绑定pre-reconciliation release commit
- **THEN** readiness MUST返回stale或blocked
- **AND** publication owner MUST拒绝旧aggregate、旧tarball和旧PR head，即使source tree相同

#### Scenario: 新 generation 重新验证
- **WHEN** main coverage与历史收敛已通过、新release generation已形成且Environment/worktree clean
- **THEN** Candidate admission MUST绑定新的release commit/tree与generation
- **AND** aggregate artifact、readiness context与carrier MUST引用同一最终source identity

#### Scenario: Candidate后main发生漂移
- **WHEN** current main前进且经来源和合并关系检查确认必须改变final release source
- **THEN** readiness MUST使相关Candidate与carrier stale，并要求重新coverage/reconciliation；若已是同一release的匹配合并结果，则复用原Candidate并只重新核验Git关系
- **AND** MUST NOT在Candidate后直接merge main、沿用旧tarball或只重跑readiness

#### Scenario: 幂等恢复
- **WHEN** reconciliation请求的全部输入与已记录post-state相同，且live main/release refs、Environment binding、coverage与resolution identity未漂移
- **THEN** owner MUST返回既有reconciliation identity和`already-converged`状态
- **AND** MUST NOT创建第二个history commit或递增generation

## ADDED Requirements

### Requirement: 发布后恢复必须允许main的合法历史延续
Publication已经成立后，恢复 MUST核验发布时的精确main提交、tree、tag和产物，允许当前main包含该发布提交的正常前进。当前main不再包含已发布提交或发布事实冲突时 MUST报告对应维护失败，MUST NOT撤销发布事实或重新发布。

#### Scenario: 发布后main正常前进
- **WHEN** npm和tag匹配且当前main包含发布时main提交
- **THEN** 来源核验与清理 MUST使用发布时提交继续恢复
- **AND** MUST保留后续main内容，不要求当前tree等于旧发布tree

#### Scenario: main历史被改写
- **WHEN** 当前main不再包含发布提交
- **THEN** 恢复 MUST保留Publication并报告来源维护冲突
- **AND** MUST不覆盖main或自动改用新版本
