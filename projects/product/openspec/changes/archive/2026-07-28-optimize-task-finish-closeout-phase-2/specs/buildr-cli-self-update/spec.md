## ADDED Requirements

### Requirement: 自举 CLI 刷新必须使用已验证 runtime identity
Buildr 自举任务在集成后刷新默认开发 CLI 时 MUST 使用 retained convergence 提供且满足产品最低版本的 Node executable，并 MUST 把 executable、版本、CLI source、安装目标和 post-install doctor 记录为 runtime-install evidence。Shell 初始化文件和 PATH 顺序 MUST NOT 成为已有 receipt-bound runtime 的 authority。

#### Scenario: Retained runtime 可用
- **WHEN** retained checkout 的 runtime identity 指向受支持 Node 和当前 CLI source
- **THEN** 安装 provider MUST 使用该 Node 执行安装预检、入口刷新、help probe 和 doctor
- **AND** 默认 CLI 链接 MUST 指向 retained Product checkout 的 canonical entry

#### Scenario: Retained runtime 不满足最低版本
- **WHEN** retained Node 版本低于 Buildr 最低要求或 executable 不可执行
- **THEN** 安装 provider MUST 在写入口前阻塞并返回稳定 runtime diagnostic
- **AND** MUST NOT 从 login shell PATH 随机选择另一个 Node 后继续
