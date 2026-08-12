## Why

当前 self-bootstrap runner 使用 retained checkout 中的源码 CLI 完成安装后检查和最终 Doctor，只能证明源码 CLI 可运行，不能证明用户之后在 PATH 中调用的默认 `buildr` 已绑定本次 retained checkout。PATH 被其他同名命令抢占、安装入口仍指向旧 checkout，或入口链路漂移时，runner 仍可能错误报告激活成功。

同时，根与 Product `AGENTS.md` 仍要求 Agent 手工编排 sync、安装与 CLI 检查，既重复 runner 流程，也只能提供 `command -v`、`--help` 这类弱证据，形成第二套容易漂移的收尾权威。

## What Changes

- 在唯一 `buildr-self-bootstrap-sync` runner 中增加 fail-closed 的默认 CLI identity gate：解析 PATH 中实际命中的 `buildr`，验证其入口链最终绑定本次 retained checkout 的 `scripts/run-development-cli` 与 `bin/buildr.mjs`。
- 通过解析后的默认入口运行 `buildr version --json`，核对 package/version 与 retained checkout；命令缺失、启动失败、入口链不匹配或版本不一致均判定激活失败。
- complete 模式通过已验证的默认入口运行最终 Doctor；doctor-blocked 模式通过同一入口恢复原 Finish run，让 resume 内的 Doctor 保持唯一最终结论。
- 在 runner Result 中增加 CLI identity evidence，并补齐 Skill、Contribution、测试与 current-state knowledge；不增加数据库、Receipt、capability 或第二个 orchestrator。
- 将根与 Product `AGENTS.md` 收敛为结果约束：自举激活成功时，默认 `buildr` 必须绑定本次 retained checkout，workspace Doctor 必须 ready；Agent 不得自行编排正式 sync、安装、CLI 检查或补跑 Doctor。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 收紧 Buildr self-bootstrap 激活的成功边界与失败语义，使默认 CLI identity 和最终 Doctor 结论由唯一 runner 证明。
- `buildr-package-assets`: 扩展 self-bootstrap Skill/runner 的入口链验证、结构化 evidence、默认入口执行与测试要求。

## Impact

- 影响 workspace 的 `buildr-self-bootstrap-sync` Skill、唯一 runner、self-bootstrap Contribution、根与 Product `AGENTS.md`、相关 OpenSpec/current-state knowledge 和测试。
- 不改变通用 Task Finish 阶段协议、SQLite authority、Environment Receipt、公共 `version --json` 契约或 npm 用户安装流程。
- 不新增依赖、数据库、Receipt、capability 或可并行编排的第二套激活流程。
