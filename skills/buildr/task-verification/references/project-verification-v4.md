# Project Verification Declaration v4

`projects/<project>/verification.yml` 是 Project 测试地图，不是测试文件清单、执行计划或运行结果；不列举每个测试文件。

顶层仅包含 `schemaVersion: buildr.project-verification/v4` 和 `testing`。每项 testing 包含稳定 `id`、`title`、Project/Service `scope`、`purpose`、相关 `sourcePaths`、用于发现具体测试的 `testRoots`、完整 `full` 入口、可选 `selection` 指导和 `requirements`。

`full.kind: command` 使用无shell `argv`和安全相对`cwd`；`agent`使用非空instructions。具体测试类、文件或请求由智能体在当前任务中从真实项目选择，不写入长期声明。

声明候选由智能体读取测试代码、构建脚本、CI和说明后形成；Application只执行inspect、validate、expected-identity update。测试体系不存在时报告建设缺口，不生成测试。
