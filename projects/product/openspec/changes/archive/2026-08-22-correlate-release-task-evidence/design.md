## Context

当前 Task Record、Task Development、Task Finish、Execution Record 与 self-bootstrap activation 各自拥有独立 authority。发布集合契约已经要求下游只消费这些 owner 的 current identity，但尚未提供一个可复用的组合读模型，因此 readiness 或受保护发布事务容易自行拼接事实。这个 Change 只在 `task` 与 `tools/release` 的窄接口之间增加组合层，不改变任何专业 writer。

## Goals / Non-Goals

**Goals:**

- 从各 owner 的 current read model 构造一个确定性的 release evidence carrier/transaction context。
- 绑定 release/support Task、Environment、Development handoff、Task Contribution、Finish Delivery、Execution Record 和 matching self-bootstrap Activation 的最小 identity/digest 与 provenance。
- 让自动 Finish、直接 Git/PR 后 reconcile、matching self-bootstrap 三条路径得到同形的 current/stale/blocked/unknown 结论。
- 保留原始 execution/diagnostic 引用，提供不依赖本地 SQLite 的窄 portable JSON read model。

**Non-Goals:**

- 不创建或修改 release branch、Candidate、tarball、公共发布或 Git 收敛。
- 不替代 Task、Finish、Environment、Verification、self-bootstrap 的 writer、状态机或清理 owner。
- 不把 OpenSpec、Review、Verification 或完整 stdout 复制进发布证据。

## Decisions

1. **组合层只读 owner ports，不新增持久化表。**
   - 选择在 release application 中调用 Task/Finish/self-bootstrap 的窄 read ports，使用 owner 返回的 identity、applicability、status、references 和 digest 组装 carrier。
   - 不选择在 release 模块再建 SQLite slot，因为那会产生第二 authority，并使 stale 判断无法与专业 Application 同步。

2. **carrier 与 transaction context 使用同一 frozen identity 链。**
   - carrier 记录参与关联的 Task/Contribution/Finish/Activation identities、source tree/remote refs 和 owner read-model digests；transaction context 只引用 carrier identity 加 release transaction identity。
   - 不接受 caller 提交的“已完成”布尔值、手写 resume manifest 或历史 stdout 作为证据。

3. **三条合法路径统一映射为 evidence role。**
   - 自动 Finish 使用 Finish Delivery 与 retained Activation；直接 Git/PR 使用 Finish reconcile 重建的同形 Delivery；self-bootstrap 必须匹配同一 delivered tree/carrier。
   - 缺失、过期、跨 run、跨 tree 或 digest 不匹配时返回结构化 finding，并阻止 consumer 把 context 视为 ready；不猜测历史事实。

4. **portable 输出只传最低充分 identity。**
   - JSON 输出包含 schema/version、carrier/context identity、evidence roles、status、owner references/digests、source identities、diagnostics refs 和 next actions；不嵌入专业 Result 正文或本地路径之外不可移植的状态。
   - 完整 stdout、attempt history 和详细诊断仍由 Execution Record/transient run-owned root 保留，通过 ref/digest 关联。

## Risks / Trade-offs

- [Owner read model 版本漂移] → 组合层在构造时核对 schema/version 与 identity，并返回 unsupported/blocked，不降级读取未知字段。
- [Finish 已交付但 Activation 或 cleanup 失败] → 将 Delivery 与 Activation/cleanup 分成独立 evidence role，保留已成立交付，不把维护失败改写为未交付。
- [Git/remote 在关联后前进] → 每次消费重新观察 source/remote identities，carrier/context 变为 stale，要求 release transaction 重新建立关联。
- [实现跨模块依赖扩大] → 只允许 `tools/release` 依赖 task 的公开 read model；Bootstrap 仍是唯一 composition root，禁止直接导入 repository。

## Migration Plan

先新增 read model 与 contract tests，再让后续 release readiness/transaction consumer 接入。旧 Task/Finish/self-bootstrap writer 无需迁移；未能构造关联时按既有 fail-closed 规则返回 blocked/unknown。回滚时移除新 consumer 与组合层，不触碰既有 SQLite schema 或发布事实。

## Open Questions

- P1-A/P1-B/P2/P3 的后续 Change 需要各自决定消费完整 carrier 还是只消费其 role 子集；本 Change 不替它们定义发布阶段策略。
