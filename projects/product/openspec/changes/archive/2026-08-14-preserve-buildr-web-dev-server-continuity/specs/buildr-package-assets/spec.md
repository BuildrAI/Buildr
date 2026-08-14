## MODIFIED Requirements

### Requirement: self-bootstrap Development Launcher必须使用独立内部manager

Buildr自举Workspace的self-bootstrap activation MUST通过retained checkout的development-only Launcher manager安装或刷新`Buildr Web Dev`，并 MUST使用Environment Receipt绑定的retained Node执行该manager。它 MUST NOT调用npm-owned `web launcher`公共命令、传入已退役的公开channel参数、要求npm installation registration，或创建和覆盖npm-owned `Buildr Web` Launcher。安装前存在经过secret health认证且属于development channel的健康默认实例时，activation MUST在安装后通过retained Project bridge以新Launcher identity在同一端口恢复并重新验证该实例；安装前没有该健康实例时 MUST保持按需启动。

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

#### Scenario: 安装前健康Development实例同端口恢复

- **WHEN** Launcher安装前的默认实例通过instance secret health认证、属于development channel且其loopback端口可证明
- **THEN** self-bootstrap activation MUST在Launcher更新后通过retained `projects/product/buildr`以Environment retained Node、新Launcher identity与原端口启动服务
- **AND** 恢复evidence MUST证明新实例健康、端口未变、source checkout与commit为retained successor，并且新PID不同于已停止实例

#### Scenario: 安装前没有健康Development实例

- **WHEN** 默认实例未运行、记录陈旧或健康实例属于其他channel
- **THEN** self-bootstrap activation MUST只完成适用的Launcher安装且不得自动启动Buildr Web Dev
- **AND** Result MUST明确记录continuity为not-applicable及观测原因

#### Scenario: Development实例恢复失败

- **WHEN** 同端口启动超时、health认证失败、恢复后的Launcher/source/Node/commit identity不匹配或启动进程提前退出
- **THEN** self-bootstrap activation MUST回收本次启动且ownership可证明的异常子进程并在Development Launcher阶段fail closed
- **AND** MUST保留已成功更新的Launcher、报告恢复operation evidence，并且不得继续development entry验证、最终Doctor或same-run Finish resume
