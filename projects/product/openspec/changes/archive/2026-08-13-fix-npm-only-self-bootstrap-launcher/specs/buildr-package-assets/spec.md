## ADDED Requirements

### Requirement: self-bootstrap Development Launcher必须使用独立内部manager

Buildr自举Workspace的self-bootstrap activation MUST通过retained checkout的development-only Launcher manager安装或刷新`Buildr Web Dev`，并 MUST使用Environment Receipt绑定的retained Node执行该manager。它 MUST NOT调用npm-owned `web launcher`公共命令、传入已退役的公开channel参数、要求npm installation registration，或创建和覆盖npm-owned `Buildr Web` Launcher。

#### Scenario: npm-only交付后激活Development Launcher

- **WHEN** frozen Task Contribution命中Development Launcher安装且公开`web launcher`已收敛为npm installation专用命令
- **THEN** self-bootstrap closeout MUST直接使用retained Node执行successor checkout内的development-only manager
- **AND** manager结果 MUST证明channel为development、source checkout为retained successor、Node为Environment Receipt绑定runtime且commit为delivered successor

#### Scenario: 公开npm Launcher拒绝development channel

- **WHEN** 用户或旧consumer向公开`buildr web launcher`传入development channel
- **THEN** CLI MUST fail closed且不得安装、改绑或登记任何Launcher

#### Scenario: Development Launcher manager失败

- **WHEN** development-only manager退出非零、返回无效结果或无法证明Launcher绑定retained checkout与retained Node
- **THEN** self-bootstrap activation MUST停止在Development Launcher阶段并报告精确operation evidence
- **AND** MUST NOT继续最终Doctor或same-run Finish resume
