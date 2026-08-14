## MODIFIED Requirements

### Requirement: 重复生命周期验证必须声明唯一主 owner
Buildr Product MUST 为 development checkout onboarding、init 行为、checkout/package parity、Task lifecycle、并发 Task Environment 和安装后 release lifecycle 声明不同的主 verifier；多个 verifier MAY 经过相同命令，但 MUST NOT 重复持有同一 happy-path 结果作为主要证据。

#### Scenario: 验证 development checkout onboarding
- **WHEN** repository onboarding verifier 在干净 Git checkout运行
- **THEN** verifier MUST 使用精确 Host Node执行 checkout 内显式 `projects/product/buildr` Project bridge，并证明 development entry identity与development update source
- **AND** verifier MUST 完成真实 sync、development-only Launcher activation和最终 Doctor，同时证明 PATH默认`buildr`与`buildr.cmd`未被读取、创建、覆盖或删除
- **AND** verifier MUST NOT安装development PATH CLI，也不得重复持有完整init或npm tarball release lifecycle

#### Scenario: 验证 init 行为
- **WHEN** init onboarding verifier 运行
- **THEN** verifier MUST 持有 unsupported adapter、source-only、完整 init、幂等、冲突和恢复提示契约
- **AND** verifier MUST 使用 checkout CLI 而不承担 tarball 安装证明

#### Scenario: 验证 checkout 与 package 一致性
- **WHEN** CLI package parity verifier 运行
- **THEN** verifier MUST 比较 checkout 与同一 candidate tarball 的代表输出和一个代表 mutation 结果
- **AND** verifier MUST NOT 重跑 Task Record、Task Review Result、Task Verification Result 或双 Task Environment 生命周期
- **AND** verifier MUST NOT 将单侧初始化成功作为独立发布证据

#### Scenario: 验证安装后发布生命周期
- **WHEN** release tarball smoke 运行
- **THEN** verifier MUST 独占安装后 init、sync、doctor、optional uninstall 和最终 doctor 的发布生命周期证据
