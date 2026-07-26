# Task Environment 的 Agent Session 采用与运行时来源证据

## 一句话摘要

让 Buildr 在采用 task environment 时同时证明执行根、checkout-local runtime 与承载任务的 Agent session 相互匹配，而不是只证明命令运行在 worktree 内。

## 背景与问题

现有 lifecycle 能创建 canonical task environment、自动准备 checkout-local Agent runtime，并由 `worktree context` 核验 repository membership、允许执行根和 CLI source。Codex Skills 在 session start 激活，因此原 session 仅把命令 `cwd` 指向新 environment，并不能证明该 session 已消费 checkout-local Skills；文件投射成功与 session runtime discovery 之间缺少明确 handoff 和 evidence。

## 目标与非目标

目标是建立 environment-ready、handoff-required、adopted 与 stale/blocked 状态，绑定 session root、runtime source identity、adapter activation 和 environment identity，并让实现、验证和收尾 consumers fail closed。非目标是不让 Buildr 控制或内省 Agent 私有 session，不提供密码学 session 认证，不承诺当前 session 热重载 Skills，也不改变 retained checkout 同步主 runtime 的边界。

## 受影响用户与角色

- Agent：在 implementation 写入前完成明确的 environment/session handoff，并消费可核验 context。
- Buildr 维护者：从公开 JSON、receipt 和测试区分 filesystem readiness 与 session adoption。
- 审查者：能识别 Buildr 直接核验的 environment evidence 和 Agent/runtime host 声明的 session evidence。

## 核心流程

1. Triage 选择 implementation 并创建 canonical task environment。
2. Buildr 准备 checkout-local runtime，返回 runtime expectation 与 `handoff-required`。
3. Agent runtime 以 environment root 启动或重新进入 session；新 session 提交 host-visible session evidence。
4. checkout-local CLI 校验 environment、runtime 与 session evidence并写入 adoption receipt。
5. context 返回 adopted 后，proposal、实现、构建、验证与收尾继续携带同一 adoption identity。
6. 集成后从 retained checkout sync 主 Workspace runtime；task adoption receipt 随 environment 安全清理。

## 关键变化

- task environment context 增加 session adoption 与 runtime-source evidence。
- runtime adapter evidence 增加供 adoption 消费的 projection identity 和 activation guidance。
- task-worktree/OpenSpec consumers 在 implementation 写入前要求 adopted，而不是只要求 allowed execution root。
- JSON 披露 `buildr-verified` 与 `agent-attested` assurance，无法证明时保持非 adopted。

## 影响、风险与兼容性

现有 JSON 通过新增字段扩展，legacy receipt 被明确视为待采用而非静默成功。主要风险是 runtime host 只能提供声明性 session evidence；通过 assurance 标签、identity 绑定和 fail-closed 缓解，不把它表述为 Buildr 私有内省或安全认证。

## 验收摘要

- 新 environment 在只有 checkout/runtime readiness 时返回 handoff-required。
- 新 session 提交匹配 evidence 后返回 adopted；只改变工具 `cwd` 不通过。
- environment、runtime projection 或 session identity 漂移会使 adoption stale/blocked。
- Codex Rules `path-read`、Skills `session-start` 和主 runtime retained-checkout sync 边界保持不变。
- OpenSpec、affected tests、knowledge inspect 与 observation absorption 全部通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Specs](specs/)
- [Tasks](tasks.md)
