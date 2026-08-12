## ADDED Requirements

### Requirement: Project 验证执行必须成为公开 CLI 表面
Buildr MUST 将 `buildr verification run` 登记为 public CLI，支持显式 `--project`、`--level affected|candidate`、`--target`、可选 task environment context、evidence output 与 `--json`；根帮助和专题帮助 MUST 说明该命令执行 Project policy，而不是调度 Agent 或创建任务。

#### Scenario: 用户查看 verification run 帮助
- **WHEN** 用户运行 `buildr help verification run`
- **THEN** 帮助 MUST 展示必需参数、task context 可选参数、evidence 生命周期和恢复诊断
- **AND** 帮助 MUST 不把 Buildr Product 专用测试入口描述为普通 Workspace 默认值

#### Scenario: 参数不足时请求 JSON
- **WHEN** 调用方缺少 Project、保证级别或必要 task binding 并请求 `--json`
- **THEN** 命令 MUST 返回登记的机器可读错误并以非零状态退出
- **AND** stdout MUST 保持单一 JSON 对象且不得混入 worker 文本
