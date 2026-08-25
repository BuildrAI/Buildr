## Why

self-bootstrap、正式 Verification 和 release transaction 都可能长时间运行并产生远超 Agent 工具承载上限的 JSON；一旦 stdout 被截断或连接中止，Agent 难以区分“仍在运行、已经失败、已经成功但展示丢失”，并可能重复启动唯一 runner 或昂贵验证。现有 Execution Record、Finish maintenance、hosted release evidence 和 Retrospective current 已经提供专业事实 authority，但缺少一致的默认紧凑投影、字节边界与单一回读入口。

## What Changes

- 为长流程定义统一的紧凑终端摘要（compact terminal summary）：稳定表达 operation、运行/结果 identity、`running|passed|blocked|failed|cancelled|unknown` 状态、关键阶段、首要失败、清理状态、展示截断状态与唯一 inspect/resume 指针。
- self-bootstrap runner 默认只输出有界 compact 摘要；完整 phase/operation/effect/diagnostic 仅在显式 full detail 时返回，并把可识别的 terminal blocked/passed 结果交给既有 Finish maintenance authority，确保 stdout 丢失后仍可回读。
- formal Verification 默认输出 compact 摘要，完整执行 payload 继续写入既有 transient evidence 与 Task Execution Record；active duplicate 只返回同一 record 的 inspect 指针，禁止默认重复执行。
- release transaction 默认输出 compact 摘要，完整 context/evidence 继续写入显式 output 或 hosted release evidence artifact；inspect-run 提供稳定 compact readback，full detail 必须显式请求。
- Retrospective list 在现有数量上限之外增加整体 UTF-8 字节预算，默认只返回摘要；正文仅在显式请求且预算允许时展开，或由单 Task inspect 读取。
- 补齐成功、失败、超大输出、客户端展示截断、断连后回读和禁止重复执行的契约与集成测试。
- **BREAKING**：上述长流程 JSON 的默认 stdout 从完整专业 Result 改为新的 compact summary；依赖完整 payload 的调用方必须显式请求 full detail 或按 summary 指针读取专业 authority。

## Capabilities

### New Capabilities

- `long-running-workflow-observability`: 定义跨 self-bootstrap、Verification、release transaction 与 bounded list 的紧凑终端摘要、展示截断和 durable readback 语义。

### Modified Capabilities

- `task-closeout-orchestration`: self-bootstrap runner 默认返回 compact 摘要，并把 terminal activation 结果保存到既有 Finish maintenance readback。
- `task-execution-artifacts`: formal Verification 默认输出 compact 摘要，继续以 Task Execution Record 作为断连后的终态与防重跑 authority。
- `open-source-release-governance`: release transaction dispatch/inspect 默认返回 compact 摘要，完整 evidence 通过显式 detail 或正式 artifact 回读。
- `task-retrospectives`: 批量 list 增加总字节边界，并保持摘要优先、单对象再展开。
- `public-json-contracts`: 登记并自动保护 compact terminal summary 及各入口的 detail/退出语义。

## Impact

- 影响 `skills/buildr-self-bootstrap-sync` bundled runner、Verification Application/CLI、`tools/release` transaction runner/evidence inspector、Task Retrospective Application/driver 与公共 JSON registry/schema coverage。
- 复用现有 Finish maintenance、Task Execution Record、hosted release evidence artifact 和 Retrospective current；不新增事件平台、日志数据库、runner 队列、第二套 Result authority 或自动重试机制。
- 需要更新 Buildr Product 的 component/integration/system/contract tests，以及受影响的 Agent Skill 使用说明。
