## ADDED Requirements

### Requirement: doctor 必须只读诊断 Workspace Node toolchain
`buildr doctor` MUST 检查 Workspace Node 声明、受管 runtime、当前 CLI、runtime `npm` 和正式验证执行环境是否解析为同一 Node identity，并 MUST 保持只读。

#### Scenario: Node toolchain 健康
- **WHEN** 声明有效、受管 runtime probe 成功且 CLI/npm/验证环境均匹配声明
- **THEN** doctor MUST 报告 Node identity 与健康状态
- **AND** MUST NOT 修改 metadata、下载 runtime 或重写 PATH

#### Scenario: runtime 缺失
- **WHEN** 声明有效但对应受管 runtime 不存在
- **THEN** doctor MUST 返回稳定 warning/error finding 和 `buildr sync <agent> --target <workspace>` 修复建议
- **AND** MUST NOT 直接安装 runtime

#### Scenario: CLI 或 npm 漂移
- **WHEN** 当前 CLI、npm 或验证环境使用的 Node 与 Workspace identity 不一致
- **THEN** doctor MUST 报告每个实际 executable/version 与期望 identity
- **AND** MUST NOT 因当前版本仍满足 `engines.node` 而把漂移视为健康
