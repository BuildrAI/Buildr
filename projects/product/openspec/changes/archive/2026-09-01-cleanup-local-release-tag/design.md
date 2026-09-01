## Context

受保护发布工作流创建远端 annotated Tag。后续 release closeout 已通过 Publication evidence 核验 Tag、npm、GitHub Release 和 release source，并清理临时 carrier、本地发布分支、lifecycle refs 与工作树，但没有处理本地同名 Tag。该 Tag 可由正式远端重建，不属于必须保留的本机恢复资源。

## Goals / Non-Goals

**Goals:**

- 远端正式 Tag 保持不变，本地同名 Tag 在完整预检后删除。
- 本地 Tag 缺失时重复 closeout 幂等成功。
- 本地或远端 Tag 与 Publication evidence 不匹配时零删除失败。
- Tag 清理结果进入 release Git closeout effects 和资源投影。

**Non-Goals:**

- 不删除或移动远端 Tag。
- 不重发 npm、GitHub Release 或发布工作流。
- 不扫描或清理其他版本、其他仓库或非 Buildr Tag。

## Decisions

1. **由 Release Git Convergence owner 清理本地 Tag。** Tag 是发布 Git 资源，不属于 Task Environment 工作树资源；Task Environment 不读取或删除 Tag。
2. **以 Publication evidence 和远端 Tag readback 作为清理授权。** owner 从 evidence 取得正式 Tag 名和提交，要求远端 `refs/tags/<tag>` 精确匹配，再检查本地同名 Tag。
3. **删除 annotated Tag ref，而不是 Tag 指向的 commit。** 本地 ref 删除后，正式远端 Tag、release branch、main、npm 与 GitHub Release仍持有发布事实。
4. **全部预检先于任何删除。** carrier、selection 和 local Tag 的归属/identity/授权一次检查完成；任一冲突保持零 effects。
5. **幂等清理。** 本地 Tag 已缺失返回 `already-cleaned`；只有本地同名 Tag 指向正式远端 Tag 对象时才删除。

备选方案是在 Task Environment cleanup 中删除 Tag；该方案会让环境 owner 管理不属于 Environment Receipt 的发布资源，因此不采用。

## Risks / Trade-offs

- [本地 Tag 被用户改写] → 与远端 Tag 对象不一致时 fail closed，保留现场。
- [远端 Tag 不可读取] → 不删除本地 Tag，避免把网络失败当作远端事实。
- [删除后用户需要本地 Tag] → 可从正式远端显式 fetch 重建；不影响任何公开发布结果。

## Migration Plan

发布新版实现后，对已经成功发布但本地 Tag 尚存的版本重跑同一 closeout。owner 复用 Publication evidence，仅完成未完成的本地 Tag 和其他本机资源清理，不重复 Publication。

## Open Questions

无。
