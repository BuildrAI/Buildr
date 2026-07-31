## Why

Buildr 已具备 task environment、验证 DAG、跨任务资源租约和双任务组合验收的主要原语，但通用验证执行器仍位于产品测试目录，普通 Workspace 无法通过已安装 CLI 直接使用；同时 Candidate 组合验收已与新的 `evidenceIdentity` 契约脱节，preview/process 的停止与 worktree 清理也没有形成完整的 task owner 门禁。现在需要把这些原语收敛为正式产品能力，并恢复可相信的 Candidate 门禁。

本变更不包含有意的破坏性变更；新增 CLI 与 JSON 契约，既有命令保持兼容。

## What Changes

- 将验证政策解析、DAG 调度、命令执行、资源租约和结构化 evidence 的通用实现迁入可发布的 `src/` runtime，并提供适用于任意已登记 Project 的正式 CLI 入口。
- 让验证入口读取 Project `verification.yml`，支持 `affected` / `candidate` 保证、依赖与 supersedes、单次 run 内并行，以及 `isolated`、`namespaced`、`coordinated`、`external` 资源策略。
- 将验证 evidence 绑定 task environment、repository candidate、实际执行根与真实 wall-clock，并提供稳定的公开 JSON schema；Task Finish 可通过正式 provider 执行或复用该 evidence。
- 让 preview stop 核对调用方 task、environment、owner 与 receipt；让 worktree cleanup 在任务拥有的 preview/process 仍存活时 fail closed。
- 修复双任务 Candidate 验收缺失 `evidenceIdentity` 的回归，补充错误 owner、运行中 preview 清理、普通 Workspace 安装后并发验证等正负向验收。
- 更新 CLI 帮助、npm runtime inventory、产品文档、current-state knowledge 与 Agent runtime 指引。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-verification`: 增加可安装的正式验证执行入口、通用 Project policy 执行、并发资源协调与 Task Finish provider 集成要求。
- `task-environments`: 增加 task-owned runtime/process 在环境清理前的强制核对与归属边界。
- `worktree-local-app-preview`: 增加停止 preview 时对 task、environment、owner 和 receipt 的 fail-closed 校验。
- `concurrent-task-acceptance`: 要求 Candidate 验收覆盖正式通用验证入口、可信 evidence identity 和产品化清理负向场景。
- `cli-product-surface`: 登记通用任务验证命令为公开 CLI 表面并定义文本帮助边界。
- `public-json-contracts`: 登记验证 run 与错误结果的版本化公开 JSON 契约及 checkout/npm parity。
- `npm-cli-package`: 要求已安装 package 包含通用验证 runtime，并在普通 Workspace 中验证其可用性。

## Impact

- 影响 Buildr CLI registry、验证 application/domain/runtime 模块、Task Finish provider、task worktree cleanup 与 Local App preview manager。
- 影响 Product `verification.yml` 消费方式、Candidate registry/组合验收、npm pack runtime dependency closure 和公开 JSON coverage。
- 需要更新 Buildr Product/Service 当前认知、CLI 文档、验证文档及投射到 Workspace 的相关 Skill/contract 指引。
