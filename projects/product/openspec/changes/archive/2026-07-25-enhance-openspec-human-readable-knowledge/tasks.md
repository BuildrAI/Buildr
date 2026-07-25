## 1. Capability contracts 与默认 providers

- [x] 1.1 新增 `buildr.terminology-governance/v1` contract，完整定义 consumer obligations、minimum guarantees、授权/副作用、结构化 result evidence、decision points 和 allowed variations。
- [x] 1.2 实现默认 `terminology-governance` Skill，覆盖 Project/Service glossary 解析、先调查后追问、冲突检测、受限写入和 `aligned|updated|unresolved|not-applicable` 结果。
- [x] 1.3 新增 `buildr.current-knowledge-maintenance/v1` contract，定义 `assess`、`reconcile`、`inspect` 与 `.buildr/knowledge-impact.yml` evidence 边界。
- [x] 1.4 实现默认 `current-knowledge-maintenance` Skill，并 required 依赖 terminology capability，覆盖影响分类、按真实内容维护、冲突停止和 follow-up 信号。
- [x] 1.5 更新 workspace/package manifests、默认 bindings、package assets 和完整性清单，使两个 contracts/providers 能被 install、update、sync、render 和 doctor 一致解析。
- [x] 1.6 补齐 capability contract、provider 声明、binding readiness、替代 provider 和 required/optional 降级的自动化测试。

## 2. OpenSpec 1.6.0 workflow 组合

- [x] 2.1 为 `openspec-explore` 声明 optional terminology dependency，并通过 Component contribution 注入术语发现与降级 evidence 指引。
- [x] 2.2 为 `openspec-propose` 和 `openspec-update-change` 声明 required current-knowledge dependency，扩展 contributions 以创建/刷新 `brief.md`、运行 assess 并维护 knowledge tasks/evidence。
- [x] 2.3 为 `openspec-apply-change` 声明 required current-knowledge dependency，扩展 contribution 以处理实现中新影响、执行知识任务并在最终验证前 reconcile。
- [x] 2.4 为 `openspec-sync-specs` 声明 required current-knowledge dependency并增加 sync 前 reconcile identity/evidence 门禁。
- [x] 2.5 为 `task-finish` 声明 required current-knowledge dependency并增加验证前 inspect 门禁；fallback reconcile 修改内容时使旧 evidence 失效并重新请求 required assurance。
- [x] 2.6 保持 `openspec-archive-change` 无归档后知识写入依赖，并验证 archive 只移动已对齐的 Brief 与 sidecar。
- [x] 2.7 更新 OpenSpec Component members、contributions、integrity 和 package receipts，并验证 install/update/uninstall 不修改 OpenSpec 1.6.0 external Skill 源 bytes。
- [x] 2.8 增加 workflow composition 测试，覆盖 required blocked、explore degraded、provider substitution、update-change 重评估、sync stale evidence 和 archive 无写入。

## 3. Change Brief 与当前认知自举

- [x] 3.1 定义并交付稳定 Brief 章节、authority/consistency 规则和缺失兼容说明，确保用户故事按需使用、核心流程优先表达跨角色/系统行为。
- [x] 3.2 为本 Change 创建 `brief.md` 和 knowledge-impact sidecar，以自举方式记录真实影响、目标、状态和来源 identities。
- [x] 3.3 建立 `openspec/knowledge/` 的 overview、glossary、architecture、flows、services 按需维护机制，不为无真实内容的目标生成空文件。
- [x] 3.4 审核 `buildr-current-state.md`，将已确认当前事实迁入实际需要的概览、产品架构、技术架构、核心流程和 Buildr Service 文档，并保持 task-boards/task-cockpits 原职责。
- [x] 3.5 建立 Buildr Product canonical glossary，至少对齐 Work Information Space、Workspace、Work Asset、Shared Work Environment、Context、Task Context、Context Window、Project、Service 和 Change；将 Workspace/Project/Service Context 作为 Context 的范围限定，并明确“位于 Workspace”不等于“被 Buildr 治理”。
- [x] 3.6 更新 README、`docs/buildr-product.md` 和 current knowledge 导航中的必要引用，并验证产品理解、当前事实、规范和历史资产仍保持单一权威边界。
- [x] 3.7 增加 Brief consistency、knowledge impact 分类、按需创建、Service 局部术语冲突和 current-state 迁移的 fixture/自动化检查。

## 4. Change read model

- [x] 4.1 扩展 Change domain/read model，在已校验 Change root 内读取 `brief.md` 并分别返回 availability、content、relative source path 和 companion identity。
- [x] 4.2 保持 active/archived、部分 artifacts、Brief 缺失和 tasks progress 的兼容语义，拒绝路径穿越或越过 Change root 的 Brief source。
- [x] 4.3 更新 public JSON/HTTP 投影及兼容 fixtures，在不破坏既有字段的前提下增加 Brief 信息。
- [x] 4.4 增加 read-model 与 API 测试，覆盖完整 Change、旧 Change 缺少 Brief、archived Brief、非法 identity、symlink/path boundary 和零写入读取。

## 5. Local App 人类优先 Change 详情

- [x] 5.1 重构 Change 详情信息架构，先展示 identity/lifecycle/progress/updated summary 和 Brief，再提供 proposal、design、specs、tasks 技术入口。
- [x] 5.2 为 Brief 章节提供可读语义结构和明确缺失状态，保留原 artifact 内容、availability 与继续/审阅 Agent action 边界。
- [x] 5.3 更新 Change 页面样式与可访问性，使长 Brief、流程、风险和技术 artifacts 在桌面浏览器中可扫描且不引入第二份详情抽屉。
- [x] 5.4 更新 Local App 单元/HTTP/browser integration 测试，覆盖 Brief 优先顺序、缺失兼容、active/archived、深链刷新和 prompt-only 行为。

## 6. 收敛与验证

- [x] 6.1 对本 Change 运行 current-knowledge `reconcile`，确认 Brief、delta specs、实现、Project knowledge 和 glossary 对应同一最终 implementation tree，处理或披露全部 unresolved 项。
- [x] 6.2 运行 Buildr package/component integrity、能力依赖 doctor、OpenSpec 1.6.0 strict validation、contract baseline/proposal check 和 `git diff --check`。
- [x] 6.3 按受影响范围运行 contracts/providers、Component lifecycle、Change read model、Local App 和 browser integration 验证，并修复失败。
- [x] 6.4 运行 Product 最终 Candidate，保存与最终 implementation identity 匹配的 timing/evidence；成功后仅勾选本任务并记录严格的 verification-result metadata transition。
