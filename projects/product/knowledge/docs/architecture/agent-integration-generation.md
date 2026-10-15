# 提交说明怎样生成

Codex 与 DSH 共用一次生成的业务链路，具体提供者（Provider）负责原生调用。它独立于原生会话（Session）与任务（Task）的关联；当前业务消费者是提交说明生成。

![生成提交说明的共同调用链](../../archify/flows/agent-generation-chain.html)

## 只看三个步骤

1. **准备**：Buildr 从准确工作树（Worktree）准备有上限的变更材料，附带固定指令、适用提交规范和结构要求。
2. **生成**：统一层固定本次执行者，轮到本身份执行时提交给具体提供者（Provider），只根据给定材料调用一次，不自行补查。
3. **呈现**：校验内容、来源和草稿版本，仍适用时填回编辑框。失败、取消或期间已有编辑，保留现有草稿。

生成只写说明；提交、推送由 Buildr 的 Git 能力执行，不由本次模型请求代办。

## 两种后端的区别

| 项目 | Codex | DSH |
| --- | --- | --- |
| 执行位置 | Buildr 管理的专用应用服务进程 | 已运行桌面的同一宿主（Host）模型服务 |
| 请求上下文 | 临时会话（Ephemeral Session）中的给定材料 | 无 `sessionId` 的单次模型调用，仅给定材料 |
| 模型配置 | 已登记原生配置；提交说明采用经确认的低推理级别（Reasoning Effort） | 读取桌面当前默认模型（Model）及提供者（Provider）；提交说明按该模型（Model）原生声明选择并确认最低受支持推理级别（Reasoning Effort），只作用于本次请求 |
| 完成与回收 | 临时会话（Ephemeral Session）释放，专用进程按需复用或回收 | 本次请求结束，连接可复用或释放；桌面和原生聊天继续运行 |

DSH 共享实际模型服务及生效的模型中间件；不自动继承已有聊天的内容、所选模型、工具、技能（Skill）、记忆或执行钩子（Hook）。桌面不可用时不会启动独立 DSH 生成进程作为替代。

DSH 普通调用继续继承桌面推理级别（Reasoning Effort）。轻量提交生成读取准确路由的模型（Model）能力，不能把不同模型（Model）的最低级别统一写成 `low`；例如原生声明最低为 `medium` 时就使用 `medium`，不会改动桌面聊天的 `max` 设置。声明不可读取、存在无法排序的级别或原生准备未确认本次选择时，生成局部失败并保留草稿。原生明确不支持可选推理级别（Reasoning Effort）的模型（Model）省略级别覆盖，按原生默认准备。旧桌面插件（Plugin）未声明轻量能力时提示更新，不静默沿用高推理。

## 提交语言从哪里来

Buildr 在统一业务层准备适用规则的有界原文摘录，优先保留显式提交语言及通用输出语言要求，再提供格式和变化证据。当前规则要求中文时应生成中文；规则要求英文时应遵循英文。近期英文提交、示例或界面语言都不能替代适用规则，产品也不写死中文。摘录继续表达来源、作用域及省略事实，生成后再次核对材料版本。

## 失败和取消怎样收敛

统一层保留按身份排队、业务时限和输出结构校验。提供者（Provider）先报告实际配置，再报告开始运行；界面只展示观察到的事实。取消、超时或断开只停止本次调用，不能取消其他请求或停止 DSH 桌面；没有确认终止时不得显示已成功取消。

运行（Run）得到结果后，业务仍会核对工作树（Worktree）的来源版本；界面再核对草稿是否被用户编辑。模型返回文本并不直接证明结果可以覆盖当前草稿。

## 核心代码入口与图示来源

| 职责 | 优先看这里 |
| --- | --- |
| 界面动作与草稿 | [SourceControlActions](../../../services/buildr-web/src/features/code/source-control-actions.ts) |
| 准备资料、提示词与业务校验 | [generateCommitMessage](../../../services/buildr/src/modules/code/application/code-commit-message-application.ts) |
| 选择、排队、运行与取消 | [startGeneration](../../../services/buildr/src/modules/agent-operations/application/agent-operations-application.ts) |
| Codex 原生调用 | [CodexAppServer](../../../services/buildr/src/modules/agent-operations/infrastructure/codex-app-server.ts) |
| DSH 桌面调用 | [DshDesktopProvider](../../../services/buildr/src/modules/agent-operations/infrastructure/dsh-desktop-provider.ts) · [DshDesktopTransport](../../../services/buildr/src/modules/agent-operations/infrastructure/dsh-desktop-transport.ts) |
| DSH 同宿主（Host）服务与请求隔离 | [桌面插件桥](../../../services/dsh-plugin/plugin/desktop-server.ts) |

时序图（Sequence Diagram）保留共同主干，不展开两种后端各自的报文。更细的配置、协议和异常处理以这些源码为准。
