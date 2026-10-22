## ADDED Requirements

### Requirement: 网页分阶段更新必须复用同一更新语义

Buildr Web 页面触发的分阶段更新 MUST 复用与 `buildr update` 相同的 installation origin 来源识别、receipt 绑定 updateAuthority、精确版本安装与同槽位实例交接端口，不得建立第二套安装路径或绕过 authority 校验。真实网页更新只适用于 npm registry package 来源；development checkout 只执行本地模拟流程，MUST NOT 触碰 registry、真实安装或交接语义；unknown 来源与 Preview 实例 MUST 拒绝写入口。网页更新成功后 MUST 经既有 `--update-handoff` 交接语义完成同槽位旧实例接管，适用时刷新既有 Launcher binding，MUST NOT 创建新 Launcher 或形成独立更新渠道。

#### Scenario: 网页触发与 CLI 同一安装路径

- **WHEN** 用户在 npm 安装的 Buildr Web 页面确认更新到已钉住的版本
- **THEN** 安装 MUST 使用同一 receipt 绑定 updateAuthority 完成 `@buildr-ai/buildr` 精确版本安装
- **AND** 交接 MUST 使用既有网页交接端口与身份核对语义

#### Scenario: development checkout 仅模拟网页更新

- **WHEN** 当前来源为 development checkout
- **THEN** 网页更新任务 MUST 仅模拟状态流转，不执行真实 registry 查询、安装或交接
- **AND** MUST NOT 改动 development checkout 文件或 installation 登记

#### Scenario: 未知来源与 Preview 拒绝网页更新

- **WHEN** 当前来源为 unknown，或实例为 Preview
- **THEN** 网页更新入口 MUST 拒绝执行且不产生安装、模拟或交接副作用
