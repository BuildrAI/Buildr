# 精简 Skill runtime 投射

## 一句话摘要

让 runtime Skill 只呈现当前 Agent 动作需要的 playbook 和 consumer-local 能力依赖，把完整 capability graph、digest、provenance 与文件完整性证据归还给 Doctor 和 `.buildr` receipt。

## 背景与问题

产品入口 `buildr` 当前被注入整个 workspace 的 scope/consumer 路由图，consumer binding 也逐项展示 SHA-256 和 provenance。机器诊断数据挤占正文后，人难以直接审阅，Agent 也会为无关依赖消耗上下文，并可能把产品入口误解成全局 dispatcher。

## 目标与非目标

目标是移除产品入口全图注入、压缩 consumer-local binding、保留 blocked safety stop，并在现有 Doctor full 与 projection receipt 中保存完整机器证据。非目标是不重做 provider resolution、Skill description 发现机制、Component Contribution 或全部外部 OpenSpec 宿主语法。

## 受影响用户或角色

使用 Buildr Skills 的 Agent 会获得更短、更明确的 runtime playbook；维护者可以直接阅读投射结果，并在需要诊断时从 Doctor/receipt 获取完整证据。

## 核心流程

Agent 先按 description 命中入口 Skill。普通 consumer 只读取自己的 binding block，再读取对应 contract/provider；required dependency blocked 时停止并通过 Doctor full 获取修复动作。产品入口只对已经命中的 Buildr 管理意图按需从 Doctor full 解析一项 route。

## 关键变化

- 删除产品入口 `Workspace routing evidence` 全图。
- runtime binding 不显示 contract SHA-256 或完整 provenance。
- consumer projection receipt 增加带独立完整性的局部 binding 快照。
- Doctor full 继续保存全局 contracts、digests、bindings、consumers 和诊断动作。
- 新增 `docs/architecture/buildr-skill-system.md` 统一说明技能体系。

## 影响、风险与兼容性

CLI、Skill/Component manifest、contract、binding 和 receipt v2 schema 均保持兼容。旧 receipt 缺少可选 binding 快照时仍可读取，下一次 render 补齐；旧 runtime 文本在下一次适用 sync/render 后收敛。产品入口需要可替换 provider 时会按需读取一次 Doctor full。

## 验收摘要

全部 supported adapters 的 consumer binding 必须局部且一致；产品入口不得出现全局 routing dump；Doctor full 与 receipt 必须保留完整机器证据；receipt 必须位于未跟踪 `.buildr/agent-runtime/`；架构文档必须说明来源、组合、投射和证据边界。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/product-agent-skills/spec.md`
- `specs/skill-capability-contracts/spec.md`
- `tasks.md`
- `docs/architecture/buildr-skill-system.md`
