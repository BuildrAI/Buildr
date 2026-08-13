## ADDED Requirements

### Requirement: Doctor 与 status 必须分别投影所有 Buildr channel
Buildr Doctor/status MUST 分别展示本机可证明的 npm CLI、正式 platform installation、development launcher 与当前运行 instance。每项 MUST 包含 channel、Buildr version、path/source root、runtime role/version/path、protocol identity、application payload digest 与 installation/instance identity；不存在 MUST 明确表达，来源未知 MUST 保持 unknown。

#### Scenario: 多渠道并存
- **WHEN** npm CLI、正式平台安装、Buildr Web Dev 与一个运行实例同时存在
- **THEN** Doctor/status MUST 返回四个独立条目并标明当前命令和实例分别属于哪个 identity
- **AND** MUST NOT 因版本、executable name、PATH priority 或 payload digest 相同而合并 ownership/lifecycle

#### Scenario: 来源 receipt 漂移
- **WHEN** 文件路径存在但 embedded installation identity、ownership receipt 或 payload digest 缺失/不一致
- **THEN** Doctor MUST 将该 channel 报告为 invalid/unknown 并给出不破坏现场的修复建议
- **AND** MUST NOT 仅根据文件名或默认安装目录宣称它是 npm、platform 或 development 来源

#### Scenario: 当前运行实例
- **WHEN** Buildr Web instance identity 可读
- **THEN** status MUST 报告实际 executable、channel、Buildr/Node/protocol/payload identity 与 loopback readiness
- **AND** incompatible instance MUST 与安装 inventory 分开报告，不得被静默归到调用方 channel

## MODIFIED Requirements

### Requirement: doctor 必须只读诊断 Workspace Node toolchain
`buildr doctor` MUST 分别检查当前 Buildr 主进程 runtime role 与 Workspace Node 声明/受管 runtime。平台主进程 MUST 匹配其 Product Node identity，npm 主进程 MUST 匹配其 host Node/`engines.node`，Workspace-owned npm、验证、Finish adapter 和项目执行环境 MUST 匹配 Workspace Node identity；Doctor MUST 保持只读且不得要求这三个 role 解析为同一 Node。

#### Scenario: Node toolchain 健康
- **WHEN** 当前 platform/npm installation runtime identity 有效，Workspace 声明有效、受管 runtime probe 成功且 Workspace-owned execution environment 匹配声明
- **THEN** doctor MUST 分字段报告 Product/host Node 与 Workspace Node identity、role 和健康状态
- **AND** MUST NOT 修改 metadata、下载 runtime、重写 PATH 或因版本相同合并两个 identity

#### Scenario: runtime 缺失
- **WHEN** Workspace 声明有效但对应受管 Workspace Node runtime 不存在
- **THEN** doctor MUST 保留当前 Product/host Node 健康结论，并为 Workspace-owned execution 返回稳定 warning/error finding 与 `buildr sync <agent> --target <workspace>` 修复建议
- **AND** MUST NOT 直接安装 runtime 或建议平台/npm 产品 update 修复 Workspace Node

#### Scenario: CLI 或 npm 漂移
- **WHEN** 当前平台主进程不匹配 Product Node、npm 主进程不满足 host identity/engines，或 Workspace-owned npm/验证环境不匹配 Workspace Node
- **THEN** doctor MUST 按 runtime role 报告每个实际 executable/version 与期望 identity
- **AND** MUST NOT 因另一个 role 的 Node 满足 `engines.node`、版本相同或可从 PATH 发现而把漂移视为健康

