## Context

Buildr 已通过 `resources/manifest.yml` 声明可选内置技能，并把完整技能目录投射到 Workspace source 与受支持的 Agent runtime。`ui-prototype` 负责在用户明确确认后生成并验证自包含 HTML；它不负责形成界面设计判断。新的 `ux-design-laws` 应补上设计与审查方法，但不能成为原型入口、实现入口、统一门禁或跨技能依赖。

候选内容来自 Laws of UX 当前 30 个公开主题和用户提供的中文学习笔记。官网内容采用 CC BY-NC-ND 4.0，因此正式技能只保存法则名称、来源链接和独立编写的操作性判断，不复制网页正文、图片或中文翻译。

## Goals / Non-Goals

**Goals:**

- 将候选稿交付为 Buildr 自有、可选、支持全部既有 runtime 的内置技能。
- 支持设计、审查和方案权衡三种工作，同时要求先观察真实用户任务和真实界面。
- 通过法则索引和分组参考实现渐进披露，避免每次加载全部 30 条法则。
- 让建议包含具体证据、用户影响、相关法则、设计动作、权衡与验证方法。
- 在内容和路由上明确与 `ui-prototype`、无障碍检查、用户研究和代码实现的边界。

**Non-Goals:**

- 不新增 capability contract、provider、consumer 或 binding。
- 不让技能自动生成 HTML、修改前端代码或执行真实产品写入。
- 不把心理学法则变成机械评分表、统一验收门禁或转化率保证。
- 不引入网络抓取、自动更新、第三方运行时依赖或网站内容镜像。
- 不修改 `ui-prototype` 的触发与结果语义。

## Decisions

### 1. 作为无 capability contract 的可选内置技能发布

`ux-design-laws` 只在单个技能内部完成知识选择和建议组织，没有其他工作流必须依赖的稳定结果，也不替换现有 provider。因此复用 `ui-prototype` 的可选 builtin 形态，在 package manifest 中声明 source、target、description、required 和 runtimes，不创建空洞 contract。

备选方案是定义 `buildr.ux-design-review` capability 并让原型或 Task Review 消费。该方案会把本可由 Agent 自主选择的方法升级为跨技能门禁，增加绑定、诊断和生命周期成本，当前没有必要。

### 2. `SKILL.md` 只保留共同工作方法，法则卡按问题分组

入口文件保存三种模式、现场调查、优先级、选择方法、输出格式和停止条件。`references/law-index.md` 把可观察信号映射到五个分组；各组保存法则卡。Agent 先读索引，再只读一至两个相关分组。

备选方案是把 30 条法则全部内联到入口。它会让所有界面任务承担相同上下文成本，并降低关键步骤的可见性。另一备选是每条法则一个文件，会增加路径和维护负担，且多数任务需要同时比较数条相关法则。

### 3. 法则卡统一为可行动结构

每条卡包含关注点、界面信号、设计动作、误用警戒、验证方法和官方来源。它不复述法则历史，也不复制网站案例。这样保留会改变 Agent 判断的内容，同时允许从具体页面证据回到可验证建议。

### 4. 高优先级事实覆盖心理学启发

入口固定按用户目标与授权、安全/隐私/无障碍、任务正确完成、心智模型与产品一致性、效率与理解、审美与愉悦的顺序权衡。进度、等待、稀缺和强调必须表达真实状态；禁止用心理效应为假进度、虚假紧迫感、隐藏退出或不自愿选择背书。

### 5. 与 `ui-prototype` 保持单向产物交接

`ux-design-laws` 在用户只要求分析、设计或审查时停在建议。用户另行明确要求原型时，建议可成为 `ui-prototype` 的输入；用户要求实现时可成为前端工作的设计输入。两个技能不建立 capability dependency，也不互相自动调用。

### 6. 复用现有完整目录打包与测试机制

正式源位于 `services/buildr/resources/workspace/skills/buildr/ux-design-laws/`，包含 `SKILL.md`、`agents/openai.yaml` 和六个 references。`resources/manifest.yml` 必须让 builtin description 与 frontmatter 完全一致，并显式列出全部 Workspace 文件映射。新增 `test/contract/ux-design-laws.test.mjs` 验证 manifest、完整目录、30 条主题、渐进披露、伦理边界和与 `ui-prototype` 的职责分离；现有 package check 与 runtime projection 测试继续证明通用安装能力。

## Risks / Trade-offs

- [法则被机械套用] → 要求从真实证据选择少量相关法则，并把法则定位为启发式判断而非结论。
- [参考内容增加维护成本] → 使用稳定卡片结构、唯一索引和官方来源链接；不建立自动抓取或镜像。
- [网站主题变化导致“30 条”陈旧] → 在索引记录核对日期；只有人工核对来源后才更新完整性声明。
- [第三方许可或署名风险] → 不复制正文、翻译和图片，仅保存事实性名称、链接和独立操作判断；保留官网许可链接。
- [与 `ui-prototype` 触发重叠] → description 和正文都明确本技能不生成原型；`ui-prototype` 继续要求用户明确确认。
- [静态测试只证明结构] → 测试不把关键词匹配冒充设计质量；真实效果仍由具体任务的界面证据和用户验证判断。

## Migration Plan

1. 增加正式技能源、package manifest 声明和 Workspace 文件映射。
2. 增加专项契约测试，运行 Skill validator、受影响测试计划、package check 和 OpenSpec strict/preflight。
3. 通过正式 Task 交付后，由既有 Buildr 自举同步流程把新 builtin 投射到 retained Workspace；当前候选工作树不直接写 retained runtime。

本变更不迁移数据、不修改现有 binding。回滚只需在后续变更中移除对应 builtin 声明和源资产，并沿用既有 builtin 生命周期处理已安装 Workspace。

## Open Questions

无。候选名称、自动发现、30 条主题范围、来源边界以及与 `ui-prototype` 的职责已经由用户确认。
