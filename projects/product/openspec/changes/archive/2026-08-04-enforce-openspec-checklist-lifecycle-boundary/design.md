## Context

当前 `buildr openspec converge` 在写后确认通过后直接调用 `openspec archive <change> --yes --skip-specs`。`--yes` 会绕过上游对未完成 tasks 的交互提示，因此 `tasks.md` 中仍有 `- [ ]` 时也能归档。与此同时，Buildr-owned OpenSpec apply contribution 仍保留“Task Finish 执行 convergence/archive”的旧文案，且没有约束 checklist 只能覆盖 Change disposition 前的动作。

这两个缺口叠加后，Agent 会把 Formal Development、Task Finish、Metadata Publication、Environment cleanup 和 Task terminal state写进 Change checklist；这些动作必须在 archive 后发生，最终只能留下冻结的未勾选项。

## Goals / Non-Goals

**Goals:**

- 用确定性门禁阻止带未完成 checkbox 的 active Change 进入 canonical apply/archive。
- 让 OpenSpec propose/update/apply contribution 在计划阶段就排除 post-archive lifecycle 动作。
- 删除当前 runtime/package 中 Task Finish convergence/archive 的旧 authority 文案，并用负向测试防回归。
- 保持历史 archive 不变，让正式 Task records继续由 Metadata Publication独立发布。

**Non-Goals:**

- 不回写或重算历史 archived Change 的 checkbox。
- 不让 Metadata Publication读取、解释或发布 `tasks.md`/Finish evidence。
- 不在通用 `buildr.task-development@1` contract 中硬编码 OpenSpec checklist。
- 不新增 checklist schema、分类字段、第二份进度 store 或通用 lifecycle state machine。

## Decisions

### 1. Convergence 在任何 canonical mutation 前检查现有 checklist

新增一个窄的 OpenSpec checklist reader，沿用 Change read model 对 Markdown checkbox 的解释：只统计行首 `- [ ]`、`- [x]` 或 `- [X]`。`runOpenSpecConvergence` 在读取/写入 receipt、规划、应用 canonical 或归档前检查 active Change；存在未完成项时返回 `blocked + change-checklist-incomplete`、`completed/total/remaining` 和唯一 next action，且 `effects: []`。

选择产品门禁而不只依赖 OpenSpec 的交互警告，是因为 `converge` 固定使用 `--yes` 且必须在非交互执行中 fail closed。reader 与 Change indexing 复用同一解析模块，避免 UI progress 和 archive gate 对 checkbox 的解释漂移。

### 2. Checklist 只表达 Change disposition 前的可执行工作

OpenSpec propose/update contributions 在生成或修订 `tasks.md` 时明确排除 Formal Development、Task Finish、Metadata Publication、Environment cleanup 与 Task terminal state。Apply contribution要求所有 Change-owned项在 convergence 前完成，并把 convergence/archive描述为 Task Development稳定Content Target之前的Change处置动作。

选择 Component-owned contributions而不是修改external `openspec-*` Skills，是为了保持外部 Skill 可独立升级；不修改通用 Task Development contract，是因为 OpenSpec 对正式 Task 仍是 `0..N` 可选关联。

### 3. Metadata Publication 只发布结果，不承担 reconciliation

正式 lifecycle writers 在 archive 后产生 Development、Review、Verification和terminal Task records；Metadata Publication仍只精确提交/推送这些portable records。历史 checklist差异作为审计事实保留，publisher不新增字段、不修改archive、不生成解释性receipt。

### 4. 负向验证同时守住行为与资产

Integration test证明未完成 checklist 时 canonical 文件、receipt和archive调用均不变化；contract/package test证明contribution不再包含Task Finish convergence authority，并必须包含pre-disposition/post-archive排除语义。现有完整journey fixture显式写入已完成tasks，避免测试绕过真实门禁。

## Risks / Trade-offs

- [已有自动化 Change 留有非实现型未完成项会被阻断] → 返回精确进度和修订/完成 checklist 的唯一动作；不自动勾选或删除任务。
- [仅靠自然语言无法识别所有 post-archive 同义表达] → deterministic gate只判断完成度，Component contribution负责语义引导；不引入脆弱关键词分类器。
- [共享 parser 可能改变 Local App progress] → 保持现有正则与缺失文件返回形状不变，并保留/补充单元或集成覆盖。
- [历史 archive仍显示不完整] → 明确保留为不可变历史，不运行迁移或倒写。
