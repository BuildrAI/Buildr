## MODIFIED Requirements

### Requirement: installed CLI uses package assets
已安装的 `buildr` command MUST 使用 npm package 中包含的 `resources/`、`web-dist/` 和明确发布的 runtime assets，而不是要求访问 development checkout。

#### Scenario: Initialize workspace from installed command
- **WHEN** the installed `buildr` command runs `buildr init --target <dir> --name <name> --profile <profile>`
- **THEN** Buildr MUST create the default workspace baseline from packaged `resources/`
- **AND** the workspace MUST NOT require files outside the installed npm package

#### Scenario: Complete onboarding from installed command
- **WHEN** the installed `buildr` command runs `buildr init --agent <agent> --target <dir> --name <name> --profile <profile>`
- **THEN** Buildr MUST create the workspace baseline, install the product Buildr Skill, reconcile the selected Agent runtime, and run final doctor using only packaged assets
- **AND** the command MUST behave consistently with the checkout-based CLI for the same inputs

#### Scenario: Run onboarding commands from installed command
- **WHEN** the installed `buildr` command runs `assets`, `project create`, `service create`, `doctor`, `sync`, `runtime check`, `rules render`, or `skills render`
- **THEN** each command MUST behave consistently with the checkout-based CLI for the same inputs
- **AND** 开发维护命令 `package check` MUST 明确要求开发检出目录，不将其描述为安装包健康检查

#### Scenario: Read recovery guidance without a working CLI
- **WHEN** 已安装命令无法启动，或本机无法联网
- **THEN** 安装包 MUST 保留源自现有 `docs/cli-reference.md` 的离线参考，包含首次安装、入口缺失、同步中断及恢复边界
- **AND** MUST 不重新创建 bootstrap 指南或命令；开发源码及未随包参考的链接不承诺离线可达
