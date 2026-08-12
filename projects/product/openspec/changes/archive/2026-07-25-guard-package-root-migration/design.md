## Context

`projects/product` 过去同时是 Product Project root 和 `@buildr-ai/buildr` 的 npm package root。实现已迁入 `projects/product/services/buildr`，但 Git 忽略的旧 `projects/product/node_modules` 不会随源码迁移移动或消失。该目录仍可能提供旧版 `.bin/openspec`，而现有 Product verifier 仅把 Service root 当作 `productRoot`，因此不会主动指出该遮蔽入口。

## Goals / Non-Goals

**Goals:**

- 使 Product source-layout verifier 将 Product Project root 的 `node_modules` 判定为已废弃 package root 的遗留物。
- 为维护者提供明确、范围受限的失败信息：应删除 Product Project root 的遗留依赖目录，并从 Buildr Service root 安装和运行依赖。
- 用 contract test 固化该目录边界，并把错误的依赖安装提示修正为 Service package root。

**Non-Goals:**

- 不让 `buildr update`、`buildr sync` 或 doctor 删除任意 workspace / Project 的 `node_modules`。
- 不扫描或管理用户业务 Service 的依赖目录，也不改变发布 CLI 的公开行为。
- 不把 `projects/product/node_modules` 的一次性清理伪装为 Git 版本化变更；它在产品变更集成后按已证明的准确路径单独执行。

## Decisions

### 将检查放入现有 source-layout verifier

在 `product-source-layout.mjs` 的 Product Project root 禁止项中加入 `node_modules`，并更新同一模块的 contract test。该 verifier 已拥有“Product Project root 只能保存治理资产、Service root 是唯一 package root”的契约，新增目录属于同一边界，不需要新 CLI 或新的通用 Skill。

备选方案是在 `buildr update` 中递归清理依赖目录。未采用：update 不拥有任意 checkout 的本地依赖状态，自动删除会越过授权和所有权边界。

### 失败信息指向唯一 Service package root

当 verifier 发现遗留目录时，输出稳定且可操作的诊断，明确 `projects/product/services/buildr` 是唯一允许安装 npm 依赖的路径。维护脚本的缺依赖提示同步使用该路径，避免引导维护者再次在旧根安装。

备选方案是仅检查 OpenSpec 版本。未采用：根因是两个 package root 共存，而不仅是某个依赖版本；目录所有权检查可同时避免所有同名 `.bin` 工具的遮蔽。

## Risks / Trade-offs

- [Git 忽略目录不会进入新 worktree] → verifier 仍会在包含遗留目录的 checkout 中失败；迁移或本机维护后必须在实际 checkout 运行受影响验证，不能只依赖新 worktree 的干净状态。
- [维护者可能在 Product Project root 放入临时目录] → `node_modules` 是明确的 npm 安装产物且该 root 已无 package metadata，拒绝它比静默容忍更安全。
- [当前遗留目录需删除] → 只在确认 root 无 `package.json`、Service package 已可用后，删除精确的 `projects/product/node_modules`，不使用泛化递归清理。

## Migration Plan

1. 实现并测试 source-layout 检查与维护提示。
2. 在 task worktree 完成受影响验证与最终 Candidate。
3. 集成产品变更后，在主 checkout 复核 `projects/product` 不再是 package root，清理唯一的遗留目录 `projects/product/node_modules`。
4. 从 Service root 重跑 source-layout 相关验证，证明没有遗留入口。

回退仅需还原版本化 verifier 与文案；已删除的旧依赖目录可由 Service root 的 `npm ci` 重建当前受支持版本，但不应恢复到废弃根。

## Open Questions

无。现有 `product-source-layout` capability 已定义唯一 Service package root，目录边界和清理对象均可由当前仓库事实确认。
