## MODIFIED Requirements

### Requirement: product verification covers npm installation
Buildr product verification MUST 测试从 product root 开始的 npm package installation path，并证明安装后的单命令 onboarding 可用。

#### Scenario: Verify installed package
- **WHEN** standalone 发布原包端到端检查（E2E） 或完整 Candidate verification 从 Buildr product root 验证正式 tarball 生命周期
- **THEN** 发布原包端到端检查（E2E） MUST pack Buildr npm package 或复用该次 Candidate 提供的不可变 tarball，安装到临时 prefix，并执行安装后的 `buildr` command
- **AND** 发布原包端到端检查（E2E） MUST 使用 `buildr init --agent <agent>`、独立 `sync` 和 `doctor --json` 证明核心 onboarding loop 与最终 runtime 状态有效
- **AND** Workspace E2E MUST NOT 重复持有 tarball inventory 或安装后 lifecycle
