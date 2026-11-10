# 实施清单

## 1. 共享目录恢复判定

- [x] 1.1 在 `shared-resources.ts` 增加顶层条目判定（`skills`、`contracts`、`components`、`commands`、`resource-set.json`），区分「未识别目录」与「未知归属内容」。
- [x] 1.2 增加带 `code: shared_resources_foreign_content` 与 `target` 的错误，文案含真实路径、未知条目与移走后重试的提示。
- [x] 1.3 让 `ensurePackageResources()` 在目录存在且清单不可读时进入锁内恢复，而不是直接抛出读取错误。
- [x] 1.4 锁内重读清单，已被其他进程恢复时直接返回，不重复替换。

## 2. 显式发布接管

- [x] 2.1 调整 `publishPackageResources()`：旧清单不可读时跳过退役来源保全并继续替换，不再因顶层 `skills/` 抛 ENOENT。
- [x] 2.2 旧清单可读时保持既有保全、版本比较与已观察身份校验。
- [x] 2.3 复用同一段锁内发布逻辑，避免普通恢复与显式发布出现两套替换语义。

## 3. Windows 瞬时占用

- [x] 3.1 增加有界重试（最多 6 次、25ms 起、总计不超过 1s），仅对 `EPERM`、`EBUSY`、`ENOTEMPTY` 生效。
- [x] 3.2 切换与临时目录清理使用该重试；全部失败时恢复原目录，保留 `.resources-next` / `.resources-previous`。
- [x] 3.3 清理临时备份失败不使已发布共享集不可用，保留备份并记录诊断。

## 4. 界面与诊断

- [x] 4.1 `workspace-preparation.ts` 把共享集不可用映射为 `workspace_resources_unavailable`，消息含路径与可执行提示，原始错误进入 `details`。
- [x] 4.2 后台刷新批次遇到共享集不可用时保留既有逐项诊断，不中断其他目录。

## 5. 测试

- [x] 5.1 集成测试：空目录、`skills/` 无清单、清单 JSON 损坏、清单为目录四种现场由普通准备恢复为当前共享集。
- [x] 5.2 集成测试：顶层含未知条目时保留文件、抛出可识别错误并包含路径。
- [x] 5.3 集成测试：显式发布接管无清单目录，且清单可读时仍先保全退役来源。
- [x] 5.4 集成测试：Windows 瞬时占用重试成功，以及重试耗尽后的回滚与可重试现场。
- [x] 5.5 集成测试：恢复后再次准备返回同一身份且不重写文件。

## 6. 当前认知

- [x] 6.1 更新 `knowledge/docs/guides/getting-started.md` 共享资源一节，说明清单缺失时自动重建、含未知内容时保留并提示路径。
- [x] 6.2 更新 `knowledge/code-map/skill-projection.md` 与 `knowledge/code-map/technical-layers.md` 的共享资源职责说明。
- [x] 6.3 更新 `services/buildr/docs/cli-reference.md` 与 `services/buildr/docs/cli-architecture.md` 中共享集恢复口径。
- [x] 6.4 核对 `knowledge/docs/reference/archify.md` 的退役保全说明与新条件一致。

## 7. 直接验证

- [x] 7.1 `npm run check:static`（四服务静态检查）与相关单元测试通过。
- [x] 7.2 `openspec validate shared-resource-recovery --strict` 与 `buildr openspec convergence preflight` 通过。
