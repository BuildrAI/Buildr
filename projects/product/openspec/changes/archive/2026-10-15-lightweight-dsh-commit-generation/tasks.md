## 1. 桌面轻量生成

- [x] 1.1 扩展可选桌面能力及专用请求，将现有内部 `low` 意图映射到 `lowest-supported`，保留普通请求继承及旧发现响应兼容；在 `services/buildr/test/integration/dsh-desktop-backend.test.ts` 验证请求转发、能力缺失局部失败和实际配置传播。
- [x] 1.2 桌面桥通过准确路由的 `resolveModelInfo` 读取能力，按已知级别语义选择最低值，经 `prepareCall` 复核后才生成；在 `services/dsh-plugin/test/unit/desktop-bridge.test.ts` 验证 `max` 到声明最低 `medium`、声明显示顺序、不可用/未知声明、无可选级别、配置不符、取消及普通继承，确认不写桌面配置或新增会话（Session）。

## 2. 适用语言规则

- [x] 2.1 调整提交规则摘录，优先保留原文显式输出语言条目及必要格式，保持来源作用域、覆盖顺序、总字节预算和材料版本检查；运行 `services/buildr/test/unit/code-commit-material.test.ts`，验证长列表中的中文要求、显式英文要求及多来源顺序均保留。

## 3. 当前说明校准

- [x] 3.1 根据最终实现更新 `knowledge/docs/architecture/agent-integration.md`、`agent-integration-generation.md` 和随包 `buildr` 技能（Skill）的 `references/agent-operations.md`，明确普通继承、专用最低受支持级别及语言规则来源；逐条核对源码和链接。现有时序图（Sequence Diagram）保持共同主干，系统图（System Diagram）只在最终标签语义受影响时局部更新，不新增无关成果。
- [x] 3.2 校准 `AgentConnectionDetails` 的既有 DSH 配置来源说明，明确模型（Model）及认证来自桌面、推理级别（Reasoning Effort）可按本次轻量请求确认；核对文案与运行（Run）实际确认值一致，不新增设置或布局。

## 4. 直接集成核验

- [x] 4.1 运行本次受影响的桌面桥、桌面提供者（Provider）及提交说明应用/材料现有检查，确认 Codex 原有 `low`、预算与草稿保护仍成立；报告真实通过范围和必要失败。
- [x] 4.2 用已确认 DSH 桌面与真实源码变更完成一次提交说明生成，观察实际模型（Model）、级别、耗时、输出语言及无新增聊天，核对桌面聊天设置保留；如真实条件不足，保留具体缺口，不以模拟测试冒充性能结论。

实测依据：2026-10-15 使用 5 个公开实际源变更构成临时 Git 测试仓（Fixture），经真实提交说明应用（Application）准备资料、原生桌面调用及结果校验，一次请求成功，实际配置为 `oauth-devin / swe-2 / medium`，标题和正文为中文，业务过程含复核共约 6.32 秒。桌面默认 `max`、接入登记及会话（Session）文件清单保持一致，不传会话编号、不请求工具（Tool）。此验证未使用用户真实工作树（Worktree）或智能体操作池（Agent Operations Pool），不代表截图那次耗时；相关界面（UI）、池与工作树边界由现有自动检查覆盖。
