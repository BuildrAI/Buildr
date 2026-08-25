# Brief

## 一句话摘要

Buildr 以v3作为唯一新验证声明契约，同时长期保留能力受限的closed v2 reader，并把Product自身live声明迁移到v3高级provider模型。

## 背景与问题

v3 Request/Plan/provider/Execution Record生命周期已经交付，但Product live声明和部分权威文档仍停留在“V2只为自举过渡、之后删除”的旧决定。历史Workspace数量会持续增加，依靠未来人工记忆删除兼容既不可靠，也没有必要；相反，应把兼容限制在只读normalizer，并让新authoring只走v3。

## 目标与非目标

目标是统一长期兼容契约、迁移Product live声明、验证V2/V3两条真实路径，并让Doctor、package、Skills、specs和current knowledge一致。非目标是扩展v2、迁移集鲜Workspace、改变Task lifecycle authority或执行正式发布。

## 受影响用户或角色

- 使用旧v2 Workspace的用户：现有声明继续可用，但Doctor提示迁移且v3-only能力不可用。
- 新建或维护声明的Agent/团队：只使用v3 Skill、template和reference。
- Buildr维护者：Product自身以v3 provider验证affected/full、Candidate与release-only选择。

## 核心流程

声明读取先按schemaVersion进入closed v3 parser或closed v2 legacy normalizer，统一形成能力模型；Verification Request据此生成Plan。v2只提供full-only、`legacy-declared`和有限`task-delivery`语义，缺失目标形成coverage gap；Product v3通过`buildr.product-verification/v1`投射registry选择，Browser能力独立执行。

## 关键变化

- V2从“待删除过渡”改为“长期、封闭、能力受限的只读兼容”。
- Product live declaration从8个v2接口收敛为v3 `product.verification` provider和独立Browser能力；Quick留在开发入口。
- package继续只发布v3 authoring资料，同时验证v2 reader/schema/fixtures没有被意外删除。
- roadmap、current knowledge与术语追上已实现架构和新的迁移时序。

## 影响、风险与兼容性

该变更向后兼容旧v2声明，不新增外部副作用。主要风险是长期reader被遗忘或用户误解为完整v3能力；通过package static validation、V2 fixtures、Doctor说明和v3-only target coverage gap约束。Product declaration变更触发验证owner的Full升级是预期行为。

## 验收摘要

- 合法v2可读取、规划和执行，非法v2阻塞，Doctor给出非阻塞能力受限提示。
- Product live declaration通过v3 schema，并能形成真实affected/full、Candidate、release-only和Browser Plan/Execution evidence。
- active specs/docs/Skills/templates不再要求删除v2，也不教授创建v2。
- 集鲜Workspace没有在本Change中被修改或误报迁移完成。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Project test capability delta](specs/project-test-capabilities/spec.md)
- [Package assets delta](specs/buildr-package-assets/spec.md)
- [Product verification quality delta](specs/product-verification-quality/spec.md)
- [Implementation tasks](tasks.md)
