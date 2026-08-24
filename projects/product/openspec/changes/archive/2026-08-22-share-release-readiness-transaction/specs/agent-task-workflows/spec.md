## ADDED Requirements

### Requirement: Buildr Release必须分离Readiness与Publication授权
`buildr-release` MUST默认先执行无副作用release readiness并向维护者展示全部findings、hosted deferred checks与next actions。只有维护者对当前frozen context明确授权publication后，Agent才可调用显式dispatch动作；Task完成、Candidate通过、历史发布授权或命令成功 MUST NOT替代本次publication授权。

#### Scenario: 维护者只要求准备或检查
- **WHEN** 维护者要求准备候选版、检查release或查看是否可发布但未明确授权publication
- **THEN** Agent MUST停在readiness Result并报告`effects: []`与hosted deferred checks
- **AND** MUST NOT dispatch workflow、请求`npm-production`approval或执行任何公共mutation

#### Scenario: 维护者明确授权publication
- **WHEN** 维护者在看到current frozen context后明确要求发布
- **THEN** Agent MUST把该授权交给唯一dispatch adapter并跟踪同一workflow run/attempt
- **AND** 不得另行创建tag、调用本机npm publish、dispatch第二workflow或生成第二tarball

#### Scenario: 发布attempt失败
- **WHEN** hosted transaction返回partial或failed evidence
- **THEN** Agent MUST先回读current attempt evidence并按`same-attempt`、`new-attempt`或`blocked-new-version`恢复分类解释已成立事实与下一步
- **AND** MUST NOT把Publication、Delivery、Activation、Environment Cleanup、Diagnostics或dev convergence互相改写
