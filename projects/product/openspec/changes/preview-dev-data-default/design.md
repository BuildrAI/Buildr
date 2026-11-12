## Context

当前 `preview-lifecycle.ts` 以 `--workspace-mode shared|snapshot` 选择数据目标（默认 shared，line 548）；snapshot 分支调用 `prepareTaskPreviewStore`（line 437-487）为工作树播种 canonical 任务库副本，并以工作树为 `environmentRoot`。自举工作空间的自身维护门禁（`workspace-preparation.ts` 的 `workspace_self_bootstrap_owned`）使 snapshot 预览永远停在“准备工作空间”，pce-verify 实测即此。`--reuse` 默认 null（line 552），配置沿用需显式声明。用户已确认单一逻辑：预览 = 任务工作树代码 + 开发版数据与配置，并授权删除 snapshot、把沿用改默认。

旧 owner 记录兼容事实：`parsePreviewOwner` 将缺失 `workspaceMode` 解析为 snapshot（line 193）；`samePreviewOwner` 以 `(left.workspaceMode || 'snapshot') === right.workspaceMode` 比较（line 291）；`resolvePreviewSharedRegistryFile` 对 snapshot owner 返回 null 不合并共享登记（workspace-registry-repository.ts line 99）。这些是旧实例安全停止/拒绝混用的既有边界。

## Goals / Non-Goals

Goals：

- 数据目标单一：任务预览服务目标恒为 canonical workspace；standalone 预览服务目标为 `--target`。
- 配置沿用默认 development，显式 `none` 退出，`--refresh-reuse` 可单独刷新。
- CLI、身份条、技能源文案与单一逻辑一致；旧实例如实显示、安全停止。

Non-Goals：

- 不新增隔离写入验收能力；不改变共享数据目标的写入保护与候选来源校验。
- 不改变候选产物准备、后台就绪、owner/secret 停止认证语义。
- 不自动迁移旧 snapshot 实例数据；旧实例由原 owner 停止（pce-verify 重启属任务级验收，不在 Change 清单）。

## Decisions

1. **参数删除而非保留 shared-only**：从 `assertNoUnknownOptions` 已知集合移除 `--workspace-mode`，旧参数按未知选项显式失败；同步删除 web.ts 与 instance-lifecycle.ts 的 help 模式文案。不静默忽略旧参数。
2. **environmentRoot 单一化**：`taskWorktree ? taskWorktree.workspaceRoot : targetRoot`；删除 `prepareTaskPreviewStore` 及 snapshot 分支、`taskStore` 播种写入。保留 `taskStore` 的旧记录解析（stop/读取兼容），新 owner 不携带播种事实。
3. **新 owner 显式写 `workspaceMode: 'shared'`**：旧运行时把缺失解析为 snapshot，显式写入保证跨版本 owner 比较与停止兼容。`samePreviewOwner`、保留快照登记 guard（line 631-635）原样保留，构成旧实例拒绝复用/混用边界。
4. **reuse 默认与退出**：`rawReuse` fallback 改为 `'development'`；`'none'` 在解析前特判为不沿用，且显式清除既有沿用事实（`reuse = null`，不回退 `previousReuse`，覆盖“曾沿用实例改 none 重启”路径）；`--refresh-reuse` 单独作用于默认选择，`none + --refresh-reuse` 显式失败。来源不可用沿用既有 `preview_reuse_source_unavailable` fail closed，诊断补充 `--reuse none` 退出提示。健康复用路径同样应用默认沿用（facet reused/refreshed 语义不变）。默认对 task 与 standalone 预览统一生效，规则单一。
5. **共享登记合并边界保留**：`resolvePreviewSharedRegistryFile` 的 snapshot→null 逻辑保留，保护仍在运行的旧 snapshot 实例；新 owner 为 shared，正常合并。
6. **身份条文案**：shared 显示“数据：开发版工作空间”，旧 snapshot 显示“数据：工作树快照（旧实例）”；reuse 后缀保留；`data-workspace-mode` 属性保留（e2e 验收契约，值仍为 shared/snapshot）。
7. **技能源重写**：`skills/buildr-dev-preview` 删除模式表 snapshot 行与手工播种配方；默认启动即单一逻辑；空现场改为 `--reuse none` + 隔离目标；托管路径参数列表与交接输出措辞同步。
8. **测试收敛**：workspace-product-suite 的 `['shared','snapshot']` 循环改单一数据目标并断言默认 reuse；preview-ownership 的 mode 参数化改默认 shared + 旧记录兼容用例；web-preview-cli help token 更新；新增旧参数未知选项、`--reuse none`、单独 `--refresh-reuse`、来源不可用 fail closed 用例；registry-scope 的 snapshot fixture 保留为旧实例不合并用例。
9. **知识校准**（assess 结果）：`knowledge/code-map/task-system.md` line 165 预览播种/数据模式措辞、`knowledge/code-map/system-services-assets.md` line 33 沿用入口措辞、`knowledge/docs/reference/json-contracts.md` line 45 模式字段措辞，按最终实现更新；index.yml 预览生命周期摘要核对后保留或微调。

## Risks / Trade-offs

- 默认沿用会把开发版配置（含 credentials 敏感级 facet）复制到预览实例根：与既有显式 reuse 边界一致，写入限定实例根，purge 语义不变。
- 无开发版数据根的环境默认启动失败：显式诊断 + `--reuse none` 退出，不无声降级；自举场景开发版恒在。
- 健康旧 snapshot 实例拒绝复用：与既有模式冲突语义一致，由原 owner 停止或换新实例名。
- 删除播种后旧 snapshot 数据不再被新逻辑读取：旧实例停止前自身仍可用，停止后数据按既有 stop/purge 语义处置。