## 1. 预览生命周期收敛（services/buildr）

- [x] 1.1 `preview-lifecycle.ts`：从已知选项集合移除 `--workspace-mode`，删除模式解析/校验、snapshot 分支与 `prepareTaskPreviewStore`；`environmentRoot` 单一化；新 owner 显式 `workspaceMode: 'shared'`、不携带播种事实；保留旧记录 `taskStore`/`workspaceMode` 解析、`samePreviewOwner` 与保留快照登记 guard。
- [x] 1.2 `startPreview` reuse 默认：fallback `development`；`none` 特判不沿用并清除既有 reuse 事实（不回退 previousReuse）；`--refresh-reuse` 单独作用于默认选择，`none + --refresh-reuse` 显式失败；来源不可用 fail closed 诊断含退出提示。
- [x] 1.3 `interfaces/cli/web.ts` 与 `application/instance-lifecycle.ts`：help 删除模式文案、补充默认沿用与 `none` 说明；list 输出保留旧实例模式列。

## 2. 前端身份条（services/buildr-web）

- [x] 2.1 `AppLayout.tsx`：shared 文案“数据：开发版工作空间”，旧 snapshot“数据：工作树快照（旧实例）”；保留 reuse 后缀与 `data-workspace-mode` 属性。

## 3. 测试收敛与新增

- [x] 3.1 `test/helpers/workspace-product-suite.ts`：模式循环改单一数据目标；断言默认 reuse development 与 environmentRoot。
- [x] 3.2 `test/integration/preview-ownership.test.ts`：默认 shared；旧记录缺失模式解析为 snapshot 的兼容用例保留；健康旧 snapshot 拒绝复用用例保留。
- [x] 3.3 `test/unit/web-preview-cli.test.ts`：help token 更新（无 `--workspace-mode`、含默认沿用与 none）。
- [x] 3.4 新增用例：旧 `--workspace-mode` 未知选项失败；`--reuse none` 不沿用；单独 `--refresh-reuse` 刷新默认；开发版来源不可用 fail closed。
- [x] 3.5 `workspace-registry-scope.test.ts` snapshot fixture 保留为旧实例不合并用例；`preview-candidate-runtime.test.ts`、`e2e/buildr-web-browser.test.ts` 核对 shared 断言仍适用。

## 4. 技能源与知识校准

- [x] 4.1 重写 `skills/buildr-dev-preview/SKILL.md`：单一逻辑默认启动；删除 snapshot 行与手工播种配方；空现场 `--reuse none`；托管参数与交接措辞同步。
- [x] 4.2 知识校准（assess 影响）：`knowledge/code-map/task-system.md` 预览条目、`knowledge/code-map/system-services-assets.md` 沿用入口、`knowledge/docs/reference/json-contracts.md` 模式字段措辞；核对 `knowledge/index.yml` 预览生命周期摘要。

## 5. 直接验证

- [x] 5.1 buildr 服务静态检查与单元测试全量；受影响 integration（preview-ownership、workspace-registry-scope、preview-candidate-runtime、preview-reuse-agent-runtime）执行。
- [x] 5.2 buildr-web 静态检查；受影响 e2e 浏览器检查（预览身份条 shared 断言）执行。