# 收敛 Buildr CLI 产品表面

## 一句话摘要

用单一 command metadata authority 管理 Buildr CLI 的执行、帮助、产品分层和验证，删除两个已无消费者的旧 OpenSpec 分阶段入口。

## 背景与问题

Buildr 当前分别在 command registry、help、架构验证和文档中维护命令事实，导致可执行 route、主题帮助和产品分类发生漂移。现行验证固定保护一份存量 key 清单，却不能证明每个 route 可发现，也提高了退役旧兼容入口的成本。

## 目标 / 非目标

目标是把 `primary`、`agent-machine`、`maintenance`、`legacy` 四层产品表面落入一个可验证 catalog，修复 retained route 的帮助一致性，并删除 `openspec sync-plan`/`sync-apply`。

本 Change 不合并领域模块，不改变 retained command 的参数、effects 或 JSON schema，不提前删除仍有消费者的 baseline/check/Skill migration 兼容入口，也不引入动态插件或第二个 CLI。

## 受影响用户或角色

- 普通用户：根帮助只呈现清晰的主要工作路径。
- Agent 与 Skill：继续依赖稳定的机器接口和完整 canonical help。
- Buildr 维护者：新增、迁移或删除 command 时只维护一份 command authority。

## 核心流程

维护者在 command descriptor 中声明 key、surface、summary、help、match 和 run adapter；CLI 从同一 catalog 完成 dispatch、根/主题帮助、未知命令候选和一致性验证。Legacy command 另外声明 replacement；删除 descriptor 后对应 route 与帮助同时消失。

## 关键变化

- 统一 command metadata 与四层产品表面。
- 补齐 `task finish` 聚合帮助并遍历验证所有 retained leaf topic。
- 删除 `openspec sync-plan`、`openspec sync-apply` 的公开 route/JSON surface，保留 `converge` 内部 deterministic primitives。
- 将固定 key 数量验证替换为 metadata 关系验证。

## 影响 / 风险 / 兼容性

删除两项 legacy route 是明确 breaking change；仓库内已无 Skill/Component consumer，旧调用改用 `buildr openspec converge`。其余 retained command 保持行为兼容。主要风险是 registry 体积和帮助文本快照波动，通过按 domain 组合完整 descriptor、验证语义而非脆弱全文快照控制。

## 验收摘要

- 所有 retained executable route 都有合法 surface 和 canonical help。
- `buildr help task finish` 与 `buildr task finish --help` 成功且零副作用。
- 删除项返回标准 unknown-command，且不再拥有 public JSON schema。
- 根帮助按四层 metadata 分区，架构验证不再硬编码完整 supported key 清单。
- affected Product tests、OpenSpec strict validation 与 current knowledge inspect 通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Spec](specs/cli-product-surface/spec.md)
- [Tasks](tasks.md)
