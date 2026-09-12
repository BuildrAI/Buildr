# 跨技能适配与激活

## 建立影响基线

- 解析 Buildr workspace、实际 scope 和当前 Agent，复用同一现场的 Doctor 诊断；缺失时运行 `buildr doctor --agent <agent> --target <workspace> --json`。需要检查依赖、绑定或跨技能影响且当前结果未包含完整能力图时，再使用 `--detail full`。
- 读取目标 Skill 源、`skills/manifest.yml`、相关 contracts、当前 bindings 和 doctor `capabilities` graph；同时区分 Agent runtime 基于 description 的入口发现与 Skill 加载后的 dependency resolution。routing evidence 存在时，只在对应产品入口已经命中的前提下检查其内部用户意图覆盖。
- 列出目标 Skill 提供的 capabilities、直接/递归 consumers、required/optional mode、当前 selected provider 和修改后的 blocked/degraded 风险。用户无需知道这些资产名称。
- 修改 Buildr builtin 时不得直接编辑用户 workspace 中的受管副本；组织差异使用组织自有 provider，Buildr 产品行为变化走产品 change。

## 先开发候选，再改变当前实现

- 在 canonical task worktree 或任务候选目录中修改或创建 Skill，记录当前 provider、binding 和 source integrity；不得先卸载或覆盖当前有效实现。
- 为候选写清触发 description、职责边界、授权/停止条件和结果证据。实现既有 contract 时逐项核对 contract；新增 contract 时使用最小 frontmatter 和固定语义章节。替换顶层入口 capability provider 时，必须验证新 provider 的 description 覆盖原用户意图，并检查旧入口或其他 Skill 是否造成触发歧义；binding ready 不能替代这项验证。
- 运行 Skill frontmatter/package 静态检查、provider 专项测试和每个受影响 consumer 的组合场景。`ready` 只表示结构可路由，不能替代行为证据。
- 候选不满足 contract、组合验证失败或计划会产生用户未接受的 blocked consumer 时停止；保留当前实现和 binding，向用户说明真正需要决定的语义差异。

## 激活与恢复

1. 使用 `buildr skills add ... --provides/--requires` 或 `--replace` 写入已验证候选；不要要求用户手改 manifest。
2. 安装新 provider 不会自动改变流程。确认候选可见后使用 `buildr skills bind <capability>@<version> --provider <skill-id> --scope <scope> --target <workspace>` 显式选择。
3. 在新 binding ready 之前不卸载旧 provider；一个 Skill 提供多个仍被使用的 capabilities 时，逐项检查后才能完整卸载。
4. 执行当前 Agent 的 `buildr sync` 或最小 scope render，再运行最终 doctor，核对受影响 consumers、runtime paths，以及已加载产品入口内部适用的 routing evidence。顶层入口发生替换时，同时确认 selected provider 已投射到 runtime，且入口 description 与激活计划一致。
5. 激活后出现新的结构 error 时，使用记录的旧 binding 恢复选择并重新 doctor；不得留下明知 blocked 的半完成适配。已经发生且无法安全自动恢复的外部副作用必须如实报告。
