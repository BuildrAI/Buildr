## 一句话摘要

将 Buildr workspace 的默认中文 Git 提交语言从 Core 迁移到随包 `AGENTS.md`，让 Git Operations、Task Finish 和其他提交消费者共享同一条可覆盖的 workspace 约定。

## 背景与问题

Core 中的默认提交语言被删除后，Git Operations 仍只保留格式约定，Agent 缺少有效的默认语言来源，近期提交重新出现大量英文。Task Finish 在 Git Operations 可选的情况下也直接消费 Agent 提供的 message，单独修 Git Operations 无法覆盖全部路径。

## 目标/非目标

目标是让新初始化或后续 sync 的用户 workspace 默认要求中文提交信息，并删除 Core 对该默认值的独立责任。非目标是修改既有历史、增加 hook、自动翻译或改变 Git 安全边界。

## 受影响用户或角色

- 使用 Buildr 初始化或同步 workspace 的 Agent：获得明确的默认中文提交约定。
- 使用 Git Operations 或 Task Finish 交付代码的 Agent：读取同一 workspace scope 规则。
- 维护 Buildr package 的 Product 开发者：不再在 Core 与 Skill 之间维护重复的语言契约。

## 核心流程

Buildr package 投射根 `AGENTS.md` → Agent 读取 workspace 默认提交语言 → 更具体的 Project、Service 或 repository 规则覆盖 → Git Operations 或 Task Finish 使用最终 message；产品只校验/冻结必要的交付 identity，不自动生成语义。

## 关键变化

- workspace `AGENTS.md` 新增默认中文 commit message 规则。
- Core 删除默认提交语言相关要求。
- Git Operations 与 Task Finish 明确遵循当前 workspace scope 规则。
- package/contract 验证从 Core 断言切换为 workspace AGENTS 断言。

## 影响/风险/兼容性

新 workspace 和执行 sync 后的已有 workspace 行为改变为默认中文；更具体约定继续覆盖。既有 Git 历史、Task Record、Finish message identity 和远端交付不迁移、不改写。

## 验收摘要

OpenSpec strict validation 通过；随包 AGENTS、Core、Git Operations、Task Finish source/package parity 与 focused contract tests 通过；验证确认没有 Git Operations 时 workspace 默认规则仍存在。

## 技术 Artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Workspace default language delta](specs/buildr-package-assets/spec.md)
- [Git Operations language delta](specs/product-agent-skills/spec.md)
- [Tasks](tasks.md)
