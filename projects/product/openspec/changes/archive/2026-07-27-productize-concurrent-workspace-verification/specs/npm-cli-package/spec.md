## ADDED Requirements

### Requirement: 已安装 package 必须包含通用验证 runtime
Buildr npm package MUST 包含 `verification run` 的 policy parser、planner、DAG scheduler、executor、resource coordinator 与 evidence lifecycle dependency closure，并 MUST 继续排除 `test/verification`；package parity MUST 在没有 Buildr 开发 checkout 的普通 Workspace 中执行代表性验证计划。

#### Scenario: Tarball CLI 执行普通 Workspace 验证
- **WHEN** Candidate 将 tarball 安装到临时 prefix，并在独立普通 Workspace 中运行 `buildr verification run`
- **THEN** 命令 MUST 完成 Project policy 解析、并发执行、资源协调和结构化结果输出
- **AND** import graph、命令 cwd 和 evidence reference MUST 不依赖开发 checkout

#### Scenario: Package inventory 遗漏验证依赖
- **WHEN** `verification run` 的任一静态 runtime dependency 未进入 tarball，或 runtime import 指向 `test/`
- **THEN** package check MUST 失败并报告缺失或越界依赖
