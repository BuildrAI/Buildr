## Context

Task Finish 已具备持久化 checkpoint、action registry、短 lease、正式验证、目标分支竞态保护和两阶段 cleanup。当前 registry 只能连续执行 `product-executable`，Git、verification、asset review、runtime install 和 worktree cleanup 等正常步骤仍以 `agent-provider` 停止，由 Agent 领取 attempt、调用 provider、重组 evidence 后再次提交。最近一次无冲突收尾共 535.9 秒，产品自动执行 5.6 秒、正式验证 50.7 秒、编排间隙 479.6 秒。

同一旅程还暴露三个接口不一致：retained impact classifier 未把一般 `src/**/*.mjs` 识别为默认 CLI 实现；production verification summary 使用扁平 lifecycle 字段，而 cleanup helper 读取嵌套对象和不同目录约定；CLI 安装脚本从 shell PATH 重新选择 Node，而不是复用已验证 runtime identity。

## Goals / Non-Goals

**Goals:**

- 在不扩大授权的前提下，让机械确定、无冲突的 provider action 由 Task Finish 连续执行。
- 让 retained impact、runtime install、verification cleanup 使用同一组结构化身份和结果契约。
- 让帮助和诊断足以直接构造正确命令。
- 用真实 journey 报告执行覆盖和往返次数，证明优化没有降低安全门禁。

**Non-Goals:**

- 不让产品替 Agent 解决 OpenSpec 语义冲突、Git 内容冲突或正式验证失败后的修复方案。
- 不自动 force push、推送远端任务分支、丢弃 dirty checkout 或终止未知进程。
- 不用固定耗时阈值作为跨机器正确性门禁，也不重写整个 Task Finish 状态机。

## Decisions

### 1. 在 action registry 增加受限的 provider-executable action

只有 selected provider 同时声明稳定 product handler、结构化输入、授权/effect 和可核验 result contract 时，registry 才把动作解析为 `provider-executable`。Safe executor 通过 handler 执行并把 provider identity、真实命令 observation 和原始 result 投射到现有 checkpoint；语义分支仍返回 `agent-provider-required`。

Product handler 不因 registry-owned 标记而信任任意调用方命令。Formal assurance 只接受 task environment 内的 Buildr bridge、可验证的 Buildr package entry，或由受支持 Node 直接加载该 package entry，并按确定偏移核对 `verification run`；其他 shell/prefix 组合停止为 `safe-plan-unavailable`。

选择这一方式而不是让 Agent 批量伪造 completion，是因为现有 attempt、lease、invalidation 和 evidence 语义可以继续复用，同时产品能观测真实执行时间。也不采用通用 shell plan 代表 provider，因为那会绕过 capability contract 与 result validation。

### 2. 影响分类由产品路径政策驱动

retained classifier 使用 Product-relative canonical path，并把 `services/buildr/src/**/*.mjs`、CLI 入口及安装映射识别为默认 CLI 影响；Local App 和 runtime projection 继续使用更精确的附加分类。未知路径仍只 doctor，不升级为全量安装。

该选择使产品行为与自举规则一致，同时避免把真正未知路径自动扩大为副作用。

### 3. Verification 只保留一种公开 evidence lifecycle

`buildr.verification-run/v1` 直接携带一个 canonical lifecycle 对象，verification provider 的 `inspect|execute|cleanup` 都消费同一结构。Cleanup reference 指向 provider-owned run directory，summary path 位于该目录内；cleanup 先验证 schema、retention、run identity、目录前缀和边界，再删除精确目录。迁移期可读取旧扁平字段，但新输出不得同时写两套事实。

选择公共 provider cleanup 而不是调用测试目录 helper，使安装后的 Buildr 与开发 checkout 共享同一产品能力。

公开 cleanup 的重复调用不能依赖已被首次清理删除的 summary 文件；当精确 `summary.json` 路径位于临时根下、父目录符合 provider run 前缀且整个 run directory 已不存在时，操作只返回 `already-absent`，不执行删除。父目录仍存在、路径越界或命名不匹配时继续 fail closed。

### 4. Runtime install 显式传递 Node identity

Task environment 或 retained convergence 提供已验证的 Node executable、major version 和 CLI source identity。安装 provider 使用该 executable 运行预检、安装和 post-install doctor；只有没有 receipt-bound runtime 时才解析环境，并将选择过程作为证据。交互 login shell 不再是 runtime authority。

### 5. 可发现性按 canonical topic 和参数 schema 生成

为 `task finish` 全部 action 与 `worktree inspect|cleanup` 提供主题帮助，`help <topic>` 和 `<topic> --help` 必须在读取业务参数前短路。帮助从同一参数声明生成或由契约测试核对，避免 `inspect`、`cleanup` 对 `--agent` 等参数产生猜测。

## Risks / Trade-offs

- [自动 provider action 可能扩大副作用] → 只允许登记的 product handler，动作前校验现有授权、lease、输入 identity 和 effects；任何语义分支立即停止。
- [旧 verification evidence 无法清理] → 兼容读取旧扁平字段，但只有边界可证明时清理；不可证明继续保留现场。
- [把全部源码都视为 CLI 影响会增加安装次数] → 仅限 Buildr Service 的生产 `src/**/*.mjs`，测试和文档不触发；Local App 仍独立分类。
- [Node identity 在 retained checkout 切换后陈旧] → 安装前重验 executable、版本和 CLI source，变化时仅使 runtime-install 与 cleanup 下游失效。
- [效率测试在慢机器不稳定] → 断言正常路径的 action/round-trip/coverage 结构，不断言绝对秒数；耗时只作为报告证据。

## Migration Plan

1. 先统一 verification lifecycle schema 和兼容 reader，确保旧 evidence 保持可检查。
2. 修正 retained impact 与 Node identity 传递，并覆盖自举 CLI 安装 journey。
3. 为确定 provider 增加 product handler，逐个接入 Git、verification、runtime install、asset review 与 cleanup；未接入项继续使用既有 handoff。
4. 补全帮助、JSON contract 和端到端效率证据，运行 affected 与最终 Candidate 验证。
5. 若自动 provider handler 出现问题，可将对应 registry entry 回退为 `agent-provider`；checkpoint 和已有 evidence 无需迁移。

## Open Questions

无。具体首批可自动执行的 provider action 以现有稳定 product API 和无语义分支测试为准，未满足条件的动作继续 handoff。
