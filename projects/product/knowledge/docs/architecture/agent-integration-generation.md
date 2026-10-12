# 提交说明怎样生成

Codex 与 DSH 共用下面这条临时生成链路。它独立于原生会话（Session）与任务（Task）的关联，具体提供者负责进程、配置和协议。

![生成提交说明的共同调用链](../../archify/flows/agent-generation-chain.html)

## 只看三个步骤

1. **准备**：Buildr 从当前工作树（Worktree）准备有上限的变更材料，附带固定指令和适用提交规范。
2. **生成**：统一层固定本次执行者，轮到本身份执行时，由具体提供者创建临时会话（Ephemeral Session），只根据给定材料生成一次，不自行补查。
3. **呈现**：校验内容、来源和草稿版本，仍适用时填回编辑框。失败、取消或期间已有编辑，保留现有草稿。

生成只写说明；提交、推送由 Buildr 直接操作 Git。模型沿用原生默认，提交说明使用经确认的低推理级别（Reasoning Effort）。

## 核心代码入口

| 职责 | 优先看这里 |
| --- | --- |
| 界面动作与草稿 | [SourceControlActions](../../../services/buildr-web/src/features/code/source-control-actions.ts) |
| 准备资料、提示词与校验 | [generateCommitMessage](../../../services/buildr/src/modules/code/application/code-commit-message-application.ts) |
| 选择、排队与运行 | [startGeneration](../../../services/buildr/src/modules/agent-operations/application/agent-operations-application.ts) |
| 两种协议 | [CodexAppServer](../../../services/buildr/src/modules/agent-operations/infrastructure/codex-app-server.ts) · [DshAcpServer](../../../services/buildr/src/modules/agent-operations/infrastructure/dsh-acp-server.ts) |

更细的参数、报文和异常处理直接以这些源码为准，需要时由智能体（Agent）按具体问题核实。
