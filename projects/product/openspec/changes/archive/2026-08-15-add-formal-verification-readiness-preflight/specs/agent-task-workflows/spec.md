## ADDED Requirements

### Requirement: Formal Verification 交接预检必须避免白跑且不干扰开发反馈
Buildr Task Development workflow MUST在进入Formal Verification前消费response-only readiness：明确Development-owned blocker MUST先处理；`unknown` MUST由selected current knowledge provider对同一current tree执行只读`inspect`。Provider返回`aligned|not-applicable`后，Agent MUST在该tree与Content Target未变化时直接进入现有Task Verification；`unresolved` MUST停止。该编排 MUST NOT修改通用`verification run`、开发期focused/affected测试、Task外transient verification或Candidate CI。

#### Scenario: 开发期测试不经过交接预检
- **WHEN** Agent在Content Target稳定前运行focused、affected、unit、integration或其他开发反馈
- **THEN** workflow MUST直接使用Project已有测试入口且不读取或写入Formal Verification readiness
- **AND** MUST不因Change pending、knowledge未知或policy缺失阻塞这些反馈或增加额外测试步骤

#### Scenario: 明确pending Change避免昂贵验证白跑
- **WHEN** Task Entry看到关联Change仍pending或stable Content Target/policy并非current
- **THEN** typed next MUST指向对应内容收敛/observe/policy动作而不是推荐Task Verification
- **AND** Agent MUST先稳定最终delivery content，再为新target形成正式验证evidence

#### Scenario: current knowledge瞬时确认后进入正式验证
- **WHEN** readiness为`unknown`且current knowledge `inspect`对同一tree返回`aligned`或`not-applicable`
- **THEN** Agent MUST将该次交接汇总为`ready`并直接调用selected Task Verification provider
- **AND** MUST不要求把inspect Result或ready摘要写入Development、Verification、Task Record或新sidecar

#### Scenario: current knowledge存在未解决项
- **WHEN** current knowledge `inspect`返回`unresolved`或tree identity与当前候选不匹配
- **THEN** Agent MUST停止Formal Verification并先由current knowledge owner完成reconcile或处理最小冲突
- **AND** 任何修订delivery content的处理 MUST使旧Content Target/verification evidence失效并重新观察

#### Scenario: 合法替代与非Task验证保持可用
- **WHEN** 用户基于已知current事实调整recommended顺序，或调用不属于正式Task交接的transient verification
- **THEN** workflow MUST按实际owner contract判断且不得把readiness recommendation升级为通用executor硬门禁
- **AND** code-only、Workspace-only、空Change与明确not-applicable场景 MUST继续通过其既有合法路径
