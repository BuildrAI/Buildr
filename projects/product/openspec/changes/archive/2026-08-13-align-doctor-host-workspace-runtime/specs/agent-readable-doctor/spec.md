## MODIFIED Requirements

### Requirement: doctor 必须只读诊断 Workspace Node toolchain
`buildr doctor` MUST 分别检查当前 Buildr 主进程 runtime role 与 Workspace Node 声明/受管 runtime。npm 主进程 MUST 匹配其 formal Host Node identity 与 `engines.node`，development 主进程 MUST 匹配其 checkout runtime identity，Workspace-owned npm、验证、Finish adapter 和项目执行环境 MUST 匹配 Workspace Node identity；Doctor MUST 保持只读，不得要求这些 role 解析为同一 Node，也不得报告当前不存在的 Product Node/platform role。

#### Scenario: Node toolchain 健康
- **WHEN** 当前 npm/development installation runtime identity 有效，Workspace 声明有效、受管 runtime probe 成功且 Workspace-owned execution environment 匹配声明
- **THEN** doctor MUST 分字段报告 Host/development main runtime 与 Workspace Node identity、role 和健康状态
- **AND** MUST NOT 修改 metadata、下载 runtime、重写 PATH 或因版本相同合并两个 identity

#### Scenario: runtime 缺失
- **WHEN** Workspace 声明有效但对应受管 Workspace Node runtime 不存在
- **THEN** doctor MUST 保留当前 Host/development main runtime 健康结论，并为 Workspace-owned execution 返回稳定 warning/error finding 与 `buildr sync <agent> --target <workspace>` 修复建议
- **AND** MUST NOT 直接安装 runtime 或建议 npm package/Launcher update 修复 Workspace Node

#### Scenario: CLI 或 npm 漂移
- **WHEN** 当前 npm 主进程不满足 formal Host Node identity/engines、development runtime 与 checkout identity 不符，或 Workspace-owned npm/验证环境不匹配 Workspace Node
- **THEN** doctor MUST 按 runtime role 报告每个实际 executable/version 与期望 identity
- **AND** MUST NOT 因另一个 role 的 Node 满足 `engines.node`、版本相同或可从 PATH 发现而把漂移视为健康
