## 1. Skills 多根投射模型

- [x] 1.1 扩展 Skills destination 契约，使 workspace destination 接受有序 roots 并保留单 root 兼容形态，验证：`adapter-contract` 校验用例覆盖"多 root 合法 / 不安全相对路径非法 / 主根与镜像根重复非法"，`npm run test:contract` 通过
- [x] 1.2 让 Skill 投射 plan 按根迭代生成写入与删除动作，两根复用同一 asset identity 与 render digest，验证：`test/integration/runtime-skills.test.ts` 对单 root adapter 输出与改动前逐字节一致（parity 快照），双根 fixture 生成两份目标文件
- [x] 1.3 把 Skill 投射所有权回执演进为按根分段记录文件清单与 digest，保持 `<skillId>.json` 命名与既有目录发现兼容，验证：新增用例覆盖"单根旧回执读取 / 双根回执写读 / 只有一根漂移时报 stale"，回执 schema 迁移用例通过
- [x] 1.4 在统一 preflight 中把镜像根纳入名称冲突与 external Skill 检查，保持整次零写入，验证：构造 `.agents/skills/<id>` 已被外部同 ID 不同 identity 占用的用例，断言两根与回执都未写入
- [x] 1.5 让 reconcile 按根精确清理失去 source 的受管目标，验证：删除 source 后回跑 render，两根各删自己的 orphan 且不动非 Buildr 管理文件

## 2. Qoder descriptor 切换

- [x] 2.1 将 `qoder` 的 Skills roots 设为 `.qoder/skills`（主根）与 `.agents/skills`（镜像根），并在 discovery metadata 声明两者发现依据与用户级覆盖语义，验证：`runtime list --json` 的 qoder 条目列出两个根及 `partial` inventory assurance
- [x] 2.2 为 `qoder` 增加 `cli` surface，使其 surfaces 同时声明 `ide` 与 `cli`，验证：descriptor 校验与 `runtime list` 输出包含两个 surface 及各自探测方式
- [x] 2.3 把 qoder 的 installation/version 探测改为 surface 作用域集合：macOS 按 bundle identifier 探测桌面 App 与 Qoder IDE，CLI 保留静态 `qoder --version`，无法自动确认的 surface 标注 `manual`，验证：`test/verification/runtime/adapter-contract.ts` 与 `adapter-parity.ts` 通过，且 probe 仍不经过 shell、超时在声明范围内
- [x] 2.4 用本机三形态安装证据更新 qoder 的 contract evidence 记录（官方文档 + 本机观察），验证：evidence 不含真实会话加载声明或历史 smoke 快照

## 3. 诊断行动性

- [x] 3.1 将"安装形态或版本无法自动确认"降级为非行动型 finding（`userActionRequired: false`），保持投射缺失/过期/冲突为行动型，验证：doctor 用例断言"投射一致 + 形态未确认" ⇒ `health.ready=true` 且 `repairPlan`/`nextSteps` 不含该 finding；"投射过期 + 形态未确认" ⇒ `ready=false`
- [x] 3.2 确认 runtime domain health 与 `skillInventoryEvidence` 仍公开探测事实与 activation guidance，验证：`runtime check qoder` 输出包含命中的安装形态或 `manual` 状态与 reload/新会话 guidance
- [x] 3.3 运行 `npm run typecheck` 与 `npm run test:unit`、`npm run test:contract`、`npm run test:integration`，修复本次改动引入的失败并记录仍适用的既有通过结果

## 4. 当前知识校准

- [x] 4.1 更新 `knowledge/code-map/skill-projection.md` 的运行时根与 destination 说明，加入"一个 adapter 可有主根与镜像根"及 qoder 双根事实，验证：文中路径与 `runtime list --json` 实际输出一致
- [x] 4.2 按最终实现校准 `knowledge/archify/flows/skill-projection.json` 与生成的 HTML（写入与归属视图需表达双根与按根回执），验证：Archify 渲染成功且节点/连线可追溯到实现来源，必要时更新 visual-check 结果
- [x] 4.3 复核 `knowledge/docs/architecture/buildr-skill-system.md` 与 `knowledge/docs/glossary.md` 的"Skill 投射所有权回执（Skill Projection Ownership Receipt）"条目：回执现为按 destination 与根分段，验证：术语定义与适用范围仍覆盖 user destination，且不存在"一个 Skill 只有一个根"的过时表述；若需引入"安装形态（Installation Surface）"术语，交由 `terminology-governance` 定名
- [x] 4.4 复核 `.buildr/knowledge-impact.yml`（存在时）与本次受影响成果一致，验证：逐项状态与实际文件相符

## 5. Change 收敛

- [x] 5.1 运行 `openspec validate redesign-qoder-runtime-adapter --strict`，验证：无 error，delta 的两处 MODIFIED 完整包含原 requirement 全文
- [x] 5.2 运行 `buildr openspec convergence preflight`，验证：与 `add-archify-optional-component`、`rebuild-current-knowledge` 无未处理冲突，诊断指向的规范条目已收敛

## 执行记录

- 3.3 检查现场（Node 24.15.0，worktree 先执行 `npm run artifacts:prepare`）：`test:unit` 229/229、`test:contract` 205/205、`npm run typecheck` 全部通过。`test:integration` 403 项中 4 项失败，均在未改动的 main checkout 复现同一结果：`workspace-sqlite`（期望表清单缺少 `task_review_history`）、`buildr-web-workspace` 与 `npm-launcher`（worktree 未安装 `../buildr-web` 依赖）；本变更新增与改动的用例全部通过。
- 3.3 修复的本次改动引入项：`test/verification/runtime/adapter-parity.ts` 原以"把 `PATH` 收窄到 Git 目录"隔离 Qoder 探测，组合 probe 引入后 `/usr/bin/defaults` 在该目录下可用导致用例前提失效；改为使用只链接 `git` 的空目录隔离探测，并按 `kind: 'any'` 断言 `installation: missing (any)` 与逐形态行，另补 Qoder 镜像根文件存在断言。
- 既有失败（本变更之前即为红，经用户决定在本变更内一并修正断言）：`adapter-parity.ts` 的 `task-finish` 文案断言有 3 条停留在提交 `de40f2bd`（"docs(skills): 精简收尾执行与验证登记指引"）改写前的措辞——"没有匹配任务就继续实际工作"、"不重新交付已成立的成果"、"收尾不建立统一验证记录、聚合流程状态或新的证明文件"。改为断言现文案中承担同一保证的表述（"没有匹配任务就交付实际成果，不补建记录"、"复用已经成立的交付事实"、"不因收尾、归档材料移动或提交编号变化重跑测试"）；三条否定断言与其余肯定断言经核对仍成立，技能正文未因此改动。
- 实施中发现并修复的共享根归属缺口（见 design D5）：`builtin uninstall` 按 adapter 主根分组，qoder 镜像写入 `.agents` 后其回执无人认领，codex 兜底把镜像目录判为"非 Buildr 管理的额外文件"并阻塞卸载。现按 adapter 声明的全部 workspace roots 分组（镜像根按 slug 定位回执），并让无回执 orphan 扫描跳过其他 adapter 回执已声明的同根同路径目标；delta 的"Qoder 双 Skills root 投射"场景补充该归属承诺。真实现场验证：新建仅安装 qoder 的工作空间后 `builtin uninstall task-retrospective` 一次删除两根与两份回执，`builtin restore` + 重新 render 恢复两根。
- 4.4 现场：`.buildr/knowledge-impact.yml` 仍记录已归档变更 `decouple-release-task-environment`（archive `2026-09-02-decouple-release-task-environment`），其三条 `target` 路径当前均不存在，属陈旧遗留而非本变更成果。按 `current-knowledge-maintenance` 的"陈旧记录先直接核对事实、执行清单足以表达影响时不复制第二份清单"处理：本变更的知识成果由分组 4 与真实文件表达，不覆写他方记录，另行提示维护者清理。
