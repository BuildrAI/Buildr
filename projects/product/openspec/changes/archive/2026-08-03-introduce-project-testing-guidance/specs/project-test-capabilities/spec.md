## ADDED Requirements

### Requirement: Capability 声明指导必须核对真实测试边界
Task Verification 的声明指导 MUST 读取真实 Project / Service 测试、package 或 POM scripts、CI 和项目约定，并核对 invocation、scope、环境、副作用及可用的实际成本证据。指导 MUST NOT 根据 capability id、`fast`、`unit`、目录名或技术栈惯例推断执行成本和证明范围。

#### Scenario: 名称为 fast 的重型入口
- **WHEN** 现有入口名为 `fast`，但真实调用包含大量子进程、完整 Workspace 或端到端环境
- **THEN** 声明指导 MUST 如实识别其执行边界与成本风险
- **AND** MUST NOT 仅按名称把它推荐为高频低成本能力

### Requirement: Declaration 必须只暴露稳定能力接口
Task Verification 的声明指导 MUST 将 `verification.yml` 限定为少量、稳定、可独立选择的 Project / Service capability 接口，不得复制每个测试文件、内部 registry step 或 Project Testing 分类卡。测试意图、执行边界、编排场景和成本目标 MUST 保留在 Project 自身测试设计或 registry 中，不得扩展 `buildr.project-verification/v2` schema。

#### Scenario: Candidate 内部包含多个 step
- **WHEN** 一个稳定 Candidate 入口内部编排多个测试 step
- **THEN** declaration MAY 只声明该稳定 Candidate capability
- **AND** MUST NOT 因内部 step 数量创建等量 capability 或通用 DAG 字段

#### Scenario: 项目缺少适用测试
- **WHEN** 声明审查发现目标事实没有现有测试入口
- **THEN** Task Verification MUST 报告 coverage gap
- **AND** 测试建设 MUST 作为 Project Testing 或后续实现工作处理，不得在声明更新中暗中生成测试
