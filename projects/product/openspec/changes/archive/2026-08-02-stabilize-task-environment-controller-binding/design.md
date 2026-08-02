## Context

Environment Receipt 保存 `controller.sourceRoot`、`cliSource`、content `identity` 与 `adapter`。当前 Application 用 `assertStableController` 将 Receipt 创建后的任何 content hash 变化解释为 controller drift；同一 identity 又被 Preview owner 与 Verification evidence identity 消费。这使 retained Buildr 的实现版本成为一套独立于 Task checkout/provider evidence 的第二 authority。

真实的 Task 源码状态已经由 Receipt scopes 与 Git provider evidence 表达：start point、branch、HEAD、checkout path、execution root、clean/registration，以及 task checkout 内的 Runtime、CLI、依赖和 projection probes。retained Buildr 只需要证明自己是可信 Environment Manager，而不应决定 Task 位于 M1 还是 M2。

## Goals / Non-Goals

**Goals:**

- 以 Task checkout/provider evidence 作为 Task Environment 的源码版本基础。
- 保留 Git-backed retained Environment Manager 的精确 source clean 门禁和 candidate mutation 禁止。
- 让 retained Workspace 正常前进只触发对既有 Task checkout 的真实 probe，不因 controller content hash 不同而失效或改写 Receipt generation。
- 将 Preview resource ownership 与 Verification evidence applicability 迁移到各自实际 authority。

**Non-Goals:**

- 不由 Task Environment fetch、rebase、merge、同步或更新 Task checkout。
- 不增加 `update`、`rebind` 命令、用户确认、generation/revision/history、状态机或第二份 Receipt。
- 不让 candidate Buildr 创建、恢复、认领、释放或清理自己的 Environment。
- 不修改 Task Finish 的 `.buildr/` clean 判定，也不改变 Finish 的显式 Git/交付职责。

## Decisions

### 1. 分离源码版本基础与 Environment Manager trust

Task Environment 的源码版本基础由 Receipt scopes 和 provider evidence 决定。对于 Git worktree，权威事实是 start point、branch、HEAD、checkout/registration/clean 与实际 execution root；Runtime、candidate CLI、lockfile/依赖和 projection probes继续描述该 checkout 的执行基础。

Environment Manager 只负责执行 `prepare`、resource register/release 与 `cleanup` mutation。当前入口必须来自 Receipt 登记的 retained `sourceRoot`/adapter；若该 source 位于 Git checkout，其实现输入 `bin/`、`src/`、`package/`、`package.json`、`package-lock.json` 必须对 staged、unstaged、untracked 全部 clean。精确 pathspec 排除 `.buildr/`。sourceRoot/adapter 不匹配、Git clean evidence 不可取得或入口来自同一 Workspace 的 linked task worktree时 fail closed。

`inspect` 不建立 mutation authority。retained manager 执行时仍复核其可信/clean 状态；task checkout 内 candidate CLI 可以为 Development/Verification 只读 inspect，但不能由此取得任何 Receipt/resource/cleanup mutation 权限。

### 2. Receipt controller identity 是创建指纹，不是 lifecycle generation

首次 `prepare` 在任何 Receipt/provider/dependency/projection effect 前完成 manager trust/clean 检查，并把当时的 Buildr content identity写入 `controller.identity`。已有 Receipt 后不再要求该 hash 与当前 retained manager 相等，也不在正常升级后自动改写它。

因此删除普通 drift、Finish cleanup handoff 与 `controller-handoff` effect。`prepare` 继续对同一 Task checkout/provider、Runtime/CLI、依赖、projection 和资源做真实恢复 probe；`cleanup` 继续只依赖上层 authorization、Task-owned resource facts 与 Git provider delivery evidence。content identity 仅可作为兼容展示或诊断来源，不参与 ready、ownership、evidence reuse 或 Candidate 等价判断。

### 3. Task 是否吸收 M2 由显式 Git 操作决定

当 retained Workspace 从 M1 前进到 M2 而 Task checkout 仍在 M1 时，Environment 继续探测 M1 checkout。它不调用 fetch/rebase，不改变 provider plan/HEAD，也不把 retained M2 hash 写成新 generation。只有 Development/Finish 明确执行 Git 更新并改变 Task checkout/Candidate 后，下一次 Environment probe 才根据新的 checkout、CLI、依赖和 projection facts判断 ready；Review/Verification 再按新的 Candidate/target identity判断是否重做。

### 4. Preview ownership 使用 Environment 与 provider facts

Task Preview owner/caller 使用 Task ID、canonical Workspace root、Environment root、resource ID、provider id、provider identity 和结构化 handle。Preview provider 仍以 instance、pid、URL、Task checkout HEAD 等形成 provider identity，并与 Receipt resource 精确匹配。

旧 preview owner 中可能仍有 `controllerIdentity` 字段；reader 可以忽略该兼容字段，但任何 start/reuse/stop/probe/cleanup 决策都不得比较它。无需为此建立新 Preview schema或迁移历史文件。

### 5. Verification evidence 使用实际 Candidate/Environment identity

Verification `evidenceIdentity` 保留 Project policy fingerprint、Task ID、Environment/Workspace root、有序 repository candidates、实际 execution roots、Runtime、candidate CLI、依赖、projection、Workspace Node identity 和 check outcomes。删除 identity material 中的 retained `context.controller.identity`。

retained Buildr 的无关源码变化不会单独改变 evidence applicability；Task checkout/Candidate、policy、CLI/projection/Node/check facts变化仍按现有规则失效。该迁移不允许 consumer 忽略 Candidate 或 execution root，也不把内容等价扩展为跨 Environment 的默认复用。

### 6. Canonical consumers 不再要求稳定 controller identity

实现型 workflow、并发 Task acceptance、Task Preview 与 Task Finish cleanup 的现有规范统一改用 matching Task/Workspace、Environment scope/root、provider/resource/Candidate evidence 与可信 retained manager。Task Finish prepare/recovery input identity 只保留 manager adapter 和实际 Environment/Candidate facts，不纳入 Receipt 创建指纹。它们可以展示该指纹，但不得要求 hash 永久匹配或把它重新引入 owner/evidence identity。

## Risks / Trade-offs

- **[保留的 controller 指纹可能看起来像当前版本]** → 文档与 Local App 明确标注为 Receipt 创建指纹；代码不再消费它作门禁。
- **[candidate CLI 仍可只读 inspect]** → mutation API 全部独立执行 manager trust/clean guard；只读 inspect 不授予 owner 权限。
- **[retained manager 升级可能改变恢复实现]** → Git-backed manager 必须 clean，且恢复结果仍由实际 Task checkout/provider/foundation/resource probes决定。
- **[旧 Preview owner 含 controllerIdentity]** → 兼容读取但忽略该字段，provider/resource identity 继续 fail closed。

## Migration Plan

无需 Receipt schema、Preview schema或历史数据迁移。已有 `controller.identity` 原值保留；下一次 `inspect`/`prepare`/resource/cleanup 不再因其与 retained manager 当前 hash 不同而失败。旧 Preview owner 的 controller 字段被忽略，新写入不再产生该字段。Verification 新 run 使用修正后的 identity material；旧 evidence 是否可复用继续由现有 Candidate/policy/Environment checks判断，不仅因 controller hash 变化而失效。

## Open Questions

无。用户已明确版本基础、manager trust、显式 Git 更新、资源 ownership、Verification applicability 与非目标。
