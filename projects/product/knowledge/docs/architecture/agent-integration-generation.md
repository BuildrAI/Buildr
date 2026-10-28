# 提交说明怎样生成

本文依据代码模块（Code Module）和统一模型能力的当前候选实现，说明提交说明生成的输入、执行与回填边界，不代表真实账号或发布验收。

1. Buildr 从准确工作树（Worktree）读取有界变更材料和适用规则，总提示词最多 16 KiB。
2. 人从现有模型（Model）目录选择来源。请求固定账号、模型、账号身份及观察版本，经公共客户端（Client）交给独立执行后台（Execution Backend）的统一模型能力执行一次，不提供工具，不创建持久对话。
3. 模型返回后，业务核对结构、任务尾注、变更、规则与材料版本；界面再核对草稿版本，仍适用才回填。

未选择可用模型时只禁用生成，仍可手写说明并提交。失败不切换账号、不自动重发；取消与 60 秒总预算只影响本次请求，迟到结果不会覆盖草稿。支持可排序推理深度的模型采用其声明的最低档，否则沿用该模型默认，不改账号设置。

说明生成与提交是独立动作。生成只回填可编辑草稿；提交、同步和推送仍由现有 Git 能力执行。已核验任务（Task）背景要求准确尾注，没有可靠关联时不猜测任务。

## 实现位置

- [有界材料与业务校验](../../../services/buildr/src/modules/code/application/code-commit-message-application.ts)：准备材料并在回填前重读真实来源。
- [生成请求状态与取消](../../../services/buildr/src/modules/code/application/code-generation.ts)：短期内存请求，按工作空间（Workspace）查询和取消，保留超时与失败。
- [进程接入](../../../services/buildr/src/modules/agent-service/module.ts)与[公共客户端](../../../services/buildr-agent/src/process/client.ts)：跨进程传递有界请求及取消，宿主断连取消其拥有的单次调用，不取消持久对话。
- [统一模型调用](../../../services/buildr-agent/src/model-access/application.ts)：复用现有账号、目录、版本检查和协议转换，释放本次调用绑定。
- [界面草稿保护](../../../services/buildr-web/src/features/code/source-control-actions.ts)：按来源保持草稿，隔离迟到结果与切换页面。
- [生成入口](../../../services/buildr-web/src/features/code/components/SourceControlCommitPanel.tsx)：选模型、生成、取消及手写提交。
