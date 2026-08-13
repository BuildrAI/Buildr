## MODIFIED Requirements

### Requirement: Formal Finish 成功后的 Buildr Web 自举 activation 失败不得改写研发与交付事实
Workspace专属self-bootstrap activation MUST位于Formal Finish成功之后。成功 MUST证明retained checkout的显式`projects/product/buildr`绑定本次delivered retained checkout、使用Environment retained Node且最终Workspace Doctor ready；Buildr Web安装失败、显式开发入口identity不一致或最终Doctor失败 MUST明确报告“主任务已交付、自举Workspace激活未完成”、失败动作与恢复事实，并 MUST NOT改写Finish Result、Candidate、Verification、Review、decision、handoff、Task Record或Environment cleanup。Self-bootstrap MUST NOT安装、删除、覆盖或验证PATH默认development CLI。

#### Scenario: CLI activation失败
- **WHEN** Formal Finish已complete且post-Finish显式开发入口identity验证或入口启动失败
- **THEN** Finish Result MUST保持complete且Environment MUST保持cleaned
- **AND** Agent MUST返回精确失败与恢复入口，不得回退PATH默认`buildr`、重跑Formal Verification、生成Candidate或重新执行Finish

#### Scenario: Buildr Web activation失败
- **WHEN** Formal Finish已complete且development Buildr Web安装失败
- **THEN** Agent MUST保留主任务已交付事实并报告自举activation未完成
- **AND** MUST NOT触碰稳定版Buildr Web、PATH默认CLI或修改共享历史

#### Scenario: 默认CLI与最终Doctor共同通过
- **WHEN** Formal Finish已complete且所有适用post-Finish动作成功
- **THEN** self-bootstrap activation MUST仅在retained `projects/product/buildr`可证明绑定delivered retained checkout、使用Environment retained Node且通过该入口运行的最终指定Agent Doctor ready时成功
- **AND** Agent MUST NOT以PATH默认`buildr`、源码文件存在、`command -v`命中同名命令或`--help`可启动替代该证明
