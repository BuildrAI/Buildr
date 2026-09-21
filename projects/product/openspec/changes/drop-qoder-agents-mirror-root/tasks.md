## 1. 撤掉镜像根机制

- [x] 1.1 `adapter-contract.ts` 移除 `mirrorRoots` 字段与其校验（非空数组、与主根不同、不重复、逐根安全相对路径），`skillWorkspaceRoots` 退化为单根，`qoder` 声明回到 `root: '.qoder'`；验证：`runtime list --json` 的 `qoder` 条目 `destinations.workspace.roots` 只含 `.qoder`，`runtimeTargets` 不含 `.agents/skills/` 与 `.agents/buildr/skill-install-plans/`
- [x] 1.2 `projection-files.ts` 移除 `RECEIPT_ROOT_SEPARATOR`、`skillProjectionReceiptRootSlug`、回执 `runtimeRoot` 字段与按根定位参数；验证：回执路径恒为 `<skillId>.json`，单根旧回执读取与 schema 校验用例逐字节不变
- [x] 1.3 `render-plan.ts`、`inventory.ts`、`components.ts` 去掉 `rootSlug` 传参但保留 `destinations.workspace.roots` 迭代与 `claimedBySiblingReceipt` 跳过；验证：单根 adapter 投射输出与改动前一致，`.agents` 内其他 adapter 回执已声明的目录仍既不被声明为 orphan 也不报冲突

## 2. 契约与回归

- [x] 2.1 更新 `test/verification/runtime/adapter-contract.ts`：删除镜像根正反用例与 `skillDestinationRoots` 多根断言，保留 qoder surface 组合探测、共享根归属与 descriptor 校验用例；验证：该文件独立运行通过
- [x] 2.2 更新 `test/integration/runtime-skills.test.ts`：把双根投射与镜像同名冲突两个用例改为断言 `qoder` 不写 `.agents/skills`、`.agents` 已有外部同 ID Skill 时按既有 preflight 规则处理；验证：两个用例覆盖"不写入"与"不覆盖"
- [x] 2.3 更新 `test/verification/runtime/adapter-parity.ts`：qoder 的镜像根文件存在断言改为断言 `.agents/skills/buildr` 不由 qoder 投射产生；验证：全 adapter 生命周期用例通过
- [x] 2.4 运行 `npm run typecheck` 与 `npm run test:unit`、`npm run test:contract`、`npm run test:integration`；验证：本变更不引入新失败，既有通过结果保持

## 3. 当前知识回退

- [x] 3.1 `knowledge/code-map/skill-projection.md` 撤掉"主根与镜像根"与按根回执表述，恢复单根示例并保留共享 `.agents` 根的归属说明；验证：文中路径与 `runtime list --json` 实际输出一致
- [x] 3.2 `knowledge/archify/flows/skill-projection.json` 与生成的 HTML 回退双根表述（节点 sublabel、两条写边标签、结论卡片），并用 Archify `validate/deliver/visual-check` 重新出具证据；验证：showcase 0 错误 0 警告且四个桌面尺寸不溢出
- [x] 3.3 `knowledge/docs/architecture/buildr-skill-system.md` 与 `knowledge/docs/glossary.md` 的回执条目撤掉按根分段表述；验证："安装形态（Runtime Installation Surface）"条目保留，回执条目不再声称一个 Skill 可有多个根

## 4. Change 收敛

- [x] 4.1 运行 `openspec validate drop-qoder-agents-mirror-root --strict`；验证：无 error，MODIFIED requirement 完整包含现 canonical 全文与全部保留场景
- [x] 4.2 运行 `buildr openspec convergence preflight`；验证：与进行中变更无未处理冲突

## 执行记录

- 2.4 检查现场（Node 24.15.0；worktree 先执行 `npm install` 与 `npm run artifacts:prepare`）：`test:unit` 229/229、`test:contract` 205/205、`npm run typecheck` 无 `error TS`。`test:integration` 409 项中 3 项失败，均与本变更无关且在 main checkout 同样复现：`buildr-web-workspace`（worktree 未安装 `../buildr-web` 依赖）与 `workspace-sqlite`（期望表清单缺 `task_review_history`）。`test/verification/runtime/adapter-contract.ts` 与 `adapter-parity.ts` 均通过，后者覆盖 7 个 adapter 的完整生命周期，含"qoder 不产生 `.agents/skills/buildr`"。
- 2.4 契约用例 `knowledge-artifacts.test.ts` 先失败后修复：它要求代码地图点名的符号真实存在于源码，回退知识文档里对 `skillProjectionReceiptRootSlug` 的引用后转绿。该用例是本变更与当前知识一致性的有效门禁。
- 实机验证（正式自举工作空间 `/Users/chenjun/Buildr`，用本 worktree 的产品 CLI 只读检查）：`runtime check qoder` 由 `missing=30 stale=9` 变为 `ok=171 info=10 warning=0 missing=0 stale=0 orphan=0 conflict=0`；安装形态探测仍为 `installation: ok (any) - com.qoder.app`、`version: ok (any) - 1.31.1`。
- 3.2 交付证据：Archify `validate` 与 `deliver` 的 showcase 9 项检查 0 错误 0 警告，`visual-check` status pass（四个桌面尺寸不溢出），并人工查看 1440×900 浅色截图，确认节点与结论文案已回退为单根表述。
- 4.1 场景保留约束：OpenSpec 的 MODIFIED 不允许按名称丢弃主 spec 已有场景，同一 requirement 也不能同时出现在 ADDED 与 REMOVED，因此 `Qoder 双 Skills root 投射` 场景名保留、正文改写为禁止性承诺（见 design D5）。
