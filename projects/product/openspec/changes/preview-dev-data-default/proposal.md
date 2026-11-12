## Why

预览的 shared/snapshot 双数据模式偏离已确认的单一逻辑：预览应运行任务工作树的产品代码，同时使用开发版工作空间数据与配置。snapshot 把工作树当作独立工作空间，与自举工作空间自身维护门禁不相容，启动即停在“准备工作空间”（pce-verify 实测）；配置沿用（`--reuse development`）是可选参数，默认预览没有开发版模型与智能体配置。模式分支还带来播种、登记合并、复用比较等额外语义，需要现在收敛，删除错误口子并补齐默认配置。

## What Changes

- **BREAKING** 删除 `--workspace-mode` 参数与 snapshot 播种/隔离分支；旧参数按未知选项显式失败。新预览统一“任务工作树代码 + canonical workspace 数据”，不再播种工作树任务库副本。
- **BREAKING** `--reuse` 默认改为 `development`（模型目录与智能体运行配置沿用开发版数据根）；`--refresh-reuse` 可单独刷新默认沿用；新增显式退出 `--reuse none`；开发版来源不可用时默认沿用 fail closed 并给出诊断与退出方式。
- 旧 snapshot 实例记录仍可安全停止与清理；健康旧实例按既有 owner 比较拒绝新逻辑复用；共享登记合并对旧 snapshot 实例保持不合并边界。
- CLI help/list 与 buildr-web 预览身份条文案收敛为单一数据来源表达；旧实例仍如实显示 snapshot。
- 重写受管技能源 `skills/buildr-dev-preview`：默认启动即单一逻辑，删除 snapshot 模式行与手工播种配方。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `worktree-buildr-web-preview`：数据目标单一化、模式选项退役；配置沿用默认 development 与显式退出；旧实例兼容；身份条与来源表达文案。

## Impact

- `services/buildr`：`src/web/application/preview-lifecycle.ts`（参数解析、environmentRoot、删除 prepareTaskPreviewStore）、`src/web/application/preview-reuse.ts` 与 startPreview 的默认选择、`src/web/interfaces/cli/web.ts`、`src/web/application/instance-lifecycle.ts`（help/list）、`src/modules/workspace/persistence/workspace-registry-repository.ts`（旧实例边界保留）。
- `services/buildr-web`：`src/app/AppLayout.tsx` 身份条。
- 测试：`test/helpers/workspace-product-suite.ts`、`test/unit/web-preview-cli.test.ts`、`test/integration/preview-ownership.test.ts`、`test/integration/workspace-registry-scope.test.ts`、`test/integration/preview-candidate-runtime.test.ts`、`test/e2e/buildr-web-browser.test.ts`。
- 受管技能源 `skills/buildr-dev-preview/SKILL.md`（交付后由自举唯一执行器同步）。
- 当前知识校准：`knowledge/code-map/task-system.md`、`knowledge/code-map/system-services-assets.md`、`knowledge/docs/reference/json-contracts.md` 的预览模式/沿用措辞。
- 兼容：旧 owner 的 `workspaceMode`/`taskStore` 仍可读、可安全停止；新 owner 继续显式写 `workspaceMode: 'shared'` 保持 schema 兼容。不改变默认实例、共享写入保护、候选产物准备与后台就绪语义。