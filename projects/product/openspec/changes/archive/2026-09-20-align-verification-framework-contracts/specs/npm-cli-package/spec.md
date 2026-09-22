## RENAMED Requirements

- FROM: `### Requirement: 已安装 package 必须包含通用验证 runtime`
- TO: `### Requirement: 已安装 package 必须包含测试地图与任务验证报告 runtime`

## MODIFIED Requirements

### Requirement: 已安装 package 必须包含测试地图与任务验证报告 runtime
Buildr npm package MUST包含当前v4 Project测试地图的读取、校验和受控更新，以及Task验证报告的domain、repository、Application、CLI与Buildr Web server dependency closure，并 MUST继续排除`test/verification`。Package parity MUST在没有Buildr开发checkout的普通Workspace中使用公开地图入口、由智能体（Agent）直接调用项目测试工具、记录current报告并inspect applicability；MUST不依赖已退役的通用capability execution、Verification Plan或Execution Record。

#### Scenario: Tarball CLI 执行普通 Workspace 验证
- **WHEN** Candidate将tarball安装到临时prefix，并在独立普通Workspace中调用`project verification inspect|validate|update`
- **THEN** 命令 MUST完成当前v4地图解析、校验、按已观察identity更新与当前路径根解析
- **AND** import graph与解析位置 MUST不依赖开发checkout，实际测试 MUST由Agent直接调用项目工具

#### Scenario: Tarball CLI 管理 Task current Result
- **WHEN** 普通Workspace具有active Task且installed CLI调用`task verification record|inspect`
- **THEN** installed CLI MUST与checkout CLI遵守相同报告schema、原子替换和applicability语义
- **AND** 报告持久化 MUST不依赖`test/`、Product registry特例或开发checkout

#### Scenario: Package inventory 遗漏验证依赖
- **WHEN** 地图或报告Application的任一静态runtime dependency未进入tarball，或runtime import指向`test/`
- **THEN** package check MUST失败并报告缺失或越界依赖
