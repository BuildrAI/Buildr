## 1. 空闲回收边界

- [x] 1.1 调整生产默认值为 Codex 1 小时、DSH 30 分钟，保留显式覆盖；用可控时钟检查公开运行状态在各自边界前保留、边界时回收。
- [x] 1.2 补充默认时限及查询不续期的回归检查，并运行完整 `agent-operations.test.ts`，确认排队、活跃执行、回收后重启及失败保护仍成立。

## 2. 当前说明

- [x] 2.1 校准 `knowledge/docs/architecture/agent-integration.md` 的对应时限句，核对只改 Codex 为 1 小时、DSH 仍为 30 分钟；沿用现有术语（Terminology），无需新增术语定义或图示（Diagram）。
- [x] 2.2 校准接入详情中的 Codex 空闲时限说明，并在生产托管页面核对显示为 1 小时。
