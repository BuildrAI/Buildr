## MODIFIED Requirements

### Requirement: 已安装 package 必须包含通用验证 runtime
Buildr npm package MUST 包含 Project v2 declaration parser、显式 capability execution、process executor、被真实 claim 使用的 resource coordinator、transient evidence lifecycle、Task Verification domain/repository/Application/CLI 与 Local App server dependency closure，并 MUST 继续排除 `test/verification`。Package parity MUST 在没有 Buildr 开发 checkout 的普通 Workspace 中执行代表性 command capability、记录 current Result 并 inspect applicability。

#### Scenario: Tarball CLI 执行普通 Workspace 验证
- **WHEN** Candidate 将 tarball 安装到临时 prefix，并在独立普通 Workspace 中运行 `buildr verification run --project <code> --capability <id> --target-identity <identity>`
- **THEN** 命令 MUST 完成 Project v2 declaration 解析、command execution、真实 timing、可选资源协调和 transient summary 输出
- **AND** import graph、命令 cwd 和 evidence reference MUST 不依赖开发 checkout

#### Scenario: Tarball CLI 管理 Task current Result
- **WHEN** 普通 Workspace 具有 active Task 且 installed CLI 调用 `task verification record|inspect`
- **THEN** installed CLI MUST 与 checkout CLI 生成相同 Result bytes、operation JSON 和 applicability
- **AND** Result persistence MUST 不依赖 `test/`、Product registry 特例或开发 checkout

#### Scenario: Package inventory 遗漏验证依赖
- **WHEN** execution 或 Result Application 的任一静态 runtime dependency 未进入 tarball，或 runtime import 指向 `test/`
- **THEN** package check MUST 失败并报告缺失或越界依赖
