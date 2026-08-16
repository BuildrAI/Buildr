## MODIFIED Requirements

### Requirement: 产品验证必须覆盖 Buildr Web Environment authority 与清理
Buildr product verification MUST 覆盖 Task Record gate、共享执行根、单/多 repo Git provider、CLI/依赖准备、runtime projection、Task-scoped Change 解析、Buildr Web Environment inspect、资源登记、串行恢复、Finish cleanup handoff与明确放弃，并 MUST 证明所有正式 consumer 只读写 Workspace SQLite Environment current authority。Environment readiness MUST不包含全局Workspace Node probe。

#### Scenario: checkout 与 npm package 正常路径
- **WHEN** verifier 分别从 checkout 和 npm tarball 初始化临时 Workspace 并执行正式 Task 环境流程
- **THEN** 两者 MUST 产生等价的 Task Environment contract/result、SQLite current row、provider evidence 与 ready/cleanup 语义
- **AND** 只允许 machine path、时间、进程和Project显式executable等真实本机事实不同

#### Scenario: Buildr 自举依赖准备
- **WHEN** 干净task checkout没有`node_modules`且候选CLI probe失败
- **THEN** retained stable controller MUST使用Product声明的精确development Node与checkout自己的npm/lockfile完成`npm ci`后重新probe
- **AND** verifier MUST证明retained/peer `node_modules`未被复用、链接或修改

#### Scenario: 动态资源登记失败
- **WHEN** preview/dev server 已启动但 Environment writer 拒绝登记
- **THEN** creator MUST 停止刚创建的 owned process/resource 并返回失败
- **AND** current row、其他 previews、默认 Buildr Web 与其他任务 MUST 保持不受影响

#### Scenario: Task-scoped Change 与 Buildr Web Environment
- **WHEN** Change 只存在于 matching Task Environment Project root，且用户打开该 Task 详情
- **THEN** Task Record reference 与 task-scoped Change detail MUST 返回 candidate provenance，环境页签 MUST 通过 Application `inspect` 返回当前机器的有界 probe
- **AND** 全局 Change list MUST 保持 retained-only，Web/HTTP MUST 不直接读取 Receipt store 或接受任意 filesystem path

#### Scenario: 正常 Finish 与放弃 cleanup
- **WHEN** fixture 分别提供已交付 normal handoff、明确 abandon authorization 和 ownership 不明 shared root
- **THEN** Environment MUST 分别完成安全清理、清理可证明的 Task-owned dirty 资源、对不明 shared content 返回 blocked/retained
- **AND** Task Finish MUST 不直接调用 worktree cleanup、重复交付或写第二份 cleanup 结论

#### Scenario: 防止文件 authority 回退
- **WHEN** package/static/runtime verification 发现旧 environment writer、文件 importer、`worktree context/adopt` guidance、adoption receipt、environment-shaped worktree JSON/help 或 consumer direct edge 任一仍可达
- **THEN** verification MUST 失败并报告具体冲突入口
- **AND** legacy identity 只 MAY 出现在 OpenSpec archive/history，Buildr runtime、sync 与 package tests MUST NOT保留迁移 reader

### Requirement: self-bootstrap Development Launcher必须使用独立内部manager
Buildr自举Workspace的self-bootstrap activation MUST通过retained checkout的development-only Launcher manager安装或刷新`Buildr Web Dev`，并 MUST使用Environment交接且匹配Product精确development Node声明的executable执行该manager。它 MUST NOT调用npm-owned `web launcher`公共命令、传入已退役的公开channel参数、要求npm installation registration，或创建和覆盖npm-owned `Buildr Web` Launcher。安装前存在经过secret health认证且属于development channel的健康默认实例时，activation MUST在安装后通过retained Project bridge以新Launcher identity在同一端口恢复并重新验证该实例；安装前没有该健康实例时 MUST保持按需启动。

#### Scenario: npm-only交付后激活Development Launcher
- **WHEN** frozen Task Contribution命中Development Launcher安装且公开`web launcher`已收敛为npm installation专用命令
- **THEN** self-bootstrap closeout MUST直接使用retained精确development Node执行successor checkout内的development-only manager
- **AND** manager结果 MUST证明channel为development、source checkout为retained successor、Node版本与executable匹配Product声明且commit为delivered successor

#### Scenario: 公开npm Launcher拒绝development channel
- **WHEN** 用户或旧consumer向公开`buildr web launcher`传入development channel
- **THEN** CLI MUST fail closed且不得安装、改绑或登记任何Launcher

#### Scenario: Development Launcher manager失败
- **WHEN** development-only manager退出非零、返回无效结果或无法证明Launcher绑定retained checkout与精确development Node
- **THEN** self-bootstrap activation MUST停止在Development Launcher阶段并报告精确operation evidence
- **AND** MUST NOT继续最终Doctor或same-run Finish resume

#### Scenario: 安装前健康Development实例同端口恢复
- **WHEN** Launcher安装前的默认实例通过instance secret health认证、属于development channel且其loopback端口可证明
- **THEN** self-bootstrap activation MUST在Launcher更新后通过retained `projects/product/buildr`以精确development Node、新Launcher identity与原端口启动服务
- **AND** 恢复evidence MUST证明新实例健康、端口未变、source checkout与commit为retained successor，并且新PID不同于已停止实例

#### Scenario: 安装前没有健康Development实例
- **WHEN** 默认实例未运行、记录陈旧或健康实例属于其他channel
- **THEN** self-bootstrap activation MUST只完成适用的Launcher安装且不得自动启动Buildr Web Dev
- **AND** Result MUST明确记录continuity为not-applicable及观测原因

#### Scenario: Development实例恢复失败
- **WHEN** 同端口启动超时、health认证失败、恢复后的Launcher/source/Node/commit identity不匹配或启动进程提前退出
- **THEN** self-bootstrap activation MUST回收本次启动且ownership可证明的异常子进程并在Development Launcher阶段fail closed
- **AND** MUST保留已成功更新的Launcher、报告恢复operation evidence，并且不得继续development entry验证、最终Doctor或same-run Finish resume
