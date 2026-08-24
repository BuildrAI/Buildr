# Release Selection 与分支 provenance

## 目标

在 `services/buildr/tools/release` 提供 checkout-only 的 release 集合管理能力：从精确 `dev` baseline 创建 `release-<version>`，按维护者指定顺序使用 `cherry-pick -x` 纳入 commit，并以 Git ref 与 commit provenance 形成可重建的 closed read model。

## 范围

- create、update、inspect、freeze、abandon、cleanup 五类生命周期动作。
- 仅操作本地 Git；不 push、不创建 Candidate、不写 Task/Verification/Finish/self-bootstrap store。
- 冲突、漂移、脏工作区、已冻结或已放弃集合均 fail closed。
