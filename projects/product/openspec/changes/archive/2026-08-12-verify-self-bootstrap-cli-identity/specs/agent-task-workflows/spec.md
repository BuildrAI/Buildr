## MODIFIED Requirements

### Requirement: Formal Finish成功后的自举activation失败不得改写研发与交付事实
Workspace专属self-bootstrap activation MUST位于Formal Finish成功之后。成功 MUST证明默认 PATH `buildr`绑定本次delivered retained checkout且最终Workspace Doctor ready；安装失败、默认CLI identity不一致或最终Doctor失败 MUST明确报告“主任务已交付、自举Workspace激活未完成”、失败动作与恢复事实，并 MUST NOT改写Finish Result、Candidate、Verification、Review、decision、handoff、Task Record或Environment cleanup。

#### Scenario: CLI activation失败
- **WHEN** Formal Finish已complete且post-Finish development CLI安装、默认入口identity验证或默认入口启动失败
- **THEN** Finish Result MUST保持complete且Environment MUST保持cleaned
- **AND** Agent MUST返回精确失败与恢复入口，不得重跑Formal Verification、生成Candidate或重新执行Finish

#### Scenario: Local App activation失败
- **WHEN** Formal Finish已complete且development Local App安装失败
- **THEN** Agent MUST保留主任务已交付事实并报告自举activation未完成
- **AND** MUST NOT触碰稳定版Local App或修改共享历史

#### Scenario: 默认CLI与最终Doctor共同通过
- **WHEN** Formal Finish已complete且所有适用post-Finish动作成功
- **THEN** self-bootstrap activation MUST仅在默认PATH `buildr`可证明绑定delivered retained checkout且通过该入口运行的最终指定Agent Doctor ready时成功
- **AND** Agent MUST NOT以源码CLI成功、`command -v`命中同名命令或`--help`可启动替代该证明
