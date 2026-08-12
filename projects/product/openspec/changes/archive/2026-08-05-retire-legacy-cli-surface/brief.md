# 清退 Buildr Legacy CLI 产品表面

## 一句话摘要

删除三个 Legacy CLI 及其旧 OpenSpec sidecar、Project Skill 自动迁移和全部当前消费者，使 Buildr CLI 只保留 current authority。

## 背景与问题

`openspec baseline create`、`openspec check` 和 `skills migrate-project-assets` 仍作为 Legacy command 暴露。OpenSpec apply consumer 已禁止创建旧 baseline，却仍调用必须读取 baseline 的 check；Skills/Doctor 则继续把已废弃的 Project Skill source 引向自动迁移器。这些残留维持了相互矛盾的双路径。

## 目标与非目标

目标是破坏性删除三个 command、旧 handler/schema/sidecar/migration 实现、所有 consumer 和 Legacy 帮助分组。非目标是不批量重写历史 archive，不清理不属于当前三个 command 的其他 deprecated 参数兼容输入，也不新增替代迁移器。

## 受影响用户或角色

旧自动化调用者会立即收到 unknown-command；尚未迁移 Project Skill source 的旧 workspace 不再获得自动升级。当前用户与 Agent 获得更小且无歧义的 CLI 表面。

## 核心流程

OpenSpec apply 前使用 upstream strict validation 与 Planning Review；实现完成后只调用 `openspec converge` 完成冲突检查、确定性 canonical 应用和 archive。Skills 只从 workspace source authority 维护；Project scope 输入和旧 Project Skill source 保持 fail closed，不执行自动迁移。

## 关键变化

- command surface 从四类收敛为 primary、agent-machine、maintenance 三类。
- 删除旧 OpenSpec baseline/stage workflow 和 sidecar writer/reader。
- 删除 Project Skill migration planner/apply 及其 Doctor/diagnostic next action。
- package/runtime source、产品文档、current knowledge 和验证同步收敛。

## 影响、风险与兼容性

这是明确授权的破坏性变更，不提供 alias 或 compatibility window。历史 archive 保持 inert。旧 workspace 必须在升级前使用旧版本完成迁移，或自行审阅整理 source；当前版本不会猜测语义或删除未知内容。

## 验收摘要

三个命令必须从 dispatch、help、candidates 和 JSON schema 消失并保持零写入；fresh OpenSpec Change 不依赖旧 baseline；Doctor/Skills 不再推荐或执行 migration；完整产品验证、convergence、交付、Doctor 和远端回读通过。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/cli-product-surface/spec.md`
- `specs/buildr-package-assets/spec.md`
