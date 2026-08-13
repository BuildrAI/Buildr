## MODIFIED Requirements

### Requirement: 自举 CLI 刷新必须使用已验证 runtime identity
Buildr 自举任务在集成后刷新默认开发 CLI 时 MUST 使用 retained convergence 提供且满足产品最低版本的 Node executable，并 MUST 把 executable、版本、CLI source、安装目标和 post-install doctor 记录为 runtime-install evidence。安装结果 MUST 是本机薄 wrapper，持久绑定该 Node executable 与 retained checkout canonical entry；后续启动 MUST NOT 从 PATH 重新选择 Node。Shell 初始化文件和 PATH 顺序 MUST NOT 成为已有 receipt-bound runtime 的 authority。阻塞原始 Finish 的自举恢复 MUST 在修复 Task 交付前完整演练默认 CLI、Development Launcher、sync、Doctor 与原 Finish resume preflight，不得用逐症状递归修复 Task 代替闭环证明。

#### Scenario: Retained runtime 可用
- **WHEN** retained checkout 的 runtime identity 指向受支持 Node 和当前 CLI source
- **THEN** 安装 provider MUST 使用该 Node 执行安装预检、原子写入 Buildr-owned wrapper、help probe 和 doctor
- **AND** 默认 CLI wrapper MUST 精确绑定 retained Product checkout 的 canonical entry 与同一 Node executable
- **AND** 真实启动 identity MUST 与安装 evidence 的 launcher、CLI entry 和 Node executable 完全一致

#### Scenario: 既有 managed 入口迁移
- **WHEN** 安装目标是可证明属于 Buildr 的旧 symlink 或当前 owned wrapper
- **THEN** 安装 provider MUST 在同一目录原子替换为新 wrapper
- **AND** foreign file、foreign symlink 或 ownership 无法证明的入口 MUST 原样保留并 fail closed

#### Scenario: Retained runtime 不满足最低版本
- **WHEN** retained Node 版本低于 Buildr 最低要求或 executable 不可执行
- **THEN** 安装 provider MUST 在写入口前阻塞并返回稳定 runtime diagnostic
- **AND** MUST NOT 从 login shell PATH 随机选择另一个 Node 后继续

#### Scenario: 自举收尾恢复闭环
- **WHEN** 修复 Task 用于解除另一个已交付 Task 的 retained Doctor 阻塞
- **THEN** 修复 Task Finish 前 MUST 在真实本机投射上依次证明 CLI 安装、精确 Node identity、Development Launcher、workspace sync、Doctor ready 与原 Finish resume preflight
- **AND** 任一无关新问题 MUST 保持原 Finish blocked、停止并报告，不得自动创建下一个递归修复 Task
