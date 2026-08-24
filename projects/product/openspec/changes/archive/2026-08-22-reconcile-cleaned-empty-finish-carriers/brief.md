# 兼容已清理 Finish run 的空 carrier 容器

## 一句话摘要

让 Buildr 自举 runner 自动收敛 Product 已明确声明 cleaned 的历史空 run container，同时继续阻断任何非空、symlink、越界或 identity 不明的 carrier。

## 背景与问题

当前 Finish writer 已会删除 carrier 与最后的空 run container，但旧版本可能留下目录空壳。对应稳定 Result 已把 repository carrier 投影为 `availability: cleaned`、`root: null`，现有 runner 却仍按活动 carrier 规则要求真实 repository root，因而把 Buildr 自己的历史空壳误判为 `unprovable` 并阻断后续 activation。

## 目标与非目标

- 目标：对精确 run/Workspace、固定受管根、真实非 symlink、全部 carrier cleaned/root-null 且完全为空的目录建立兼容 proof，并在 activation 前非递归删除。
- 非目标：不建立“.buildr 文件都可忽略”的白名单，不放宽普通 workspace dirty 或用户代码清理规则，不改变 Finish/Environment/Delivery/Task 生命周期 authority。

## 受影响角色

主要影响维护 Buildr 自身的 Agent 与开发者。普通 Buildr 用户 workspace 不获得新的强制流程，也不会让自举 runner 处理普通用户目录。

## 核心流程

runner 枚举固定 carrier 根并经 Product inspect 取得 owning Finish Result；若 Result 与精确 entry 满足 cleaned-empty proof，就以非递归 `rmdir` 删除空壳并重新枚举。剩余真实 carrier 继续按既有 foreign ownership proof 共存或 fail closed，之后才允许 target lease、Git、sync、安装和 Doctor。

## 关键变化

- 新增 `stale-empty-container` 诊断分类，只描述一次 invocation 的受控兼容 observation，不提升为长期领域术语。
- cleaned Result proof 明确核对所有 repository carrier、Workspace carrier selector/identity/availability/root。
- 删除只使用空目录语义；目录出现任何内容、symlink、越界或 race 都阻断且不递归删除。
- 当前 Finish writer 行为保持不变。

## 影响、风险与兼容性

兼容逻辑只存在于 Workspace-owned self-bootstrap runner，不进入 npm package 或普通用户 capability。主要风险是检查与删除之间的竞态；非递归 `rmdir` 会在目录不再为空时失败并保持 activation 零副作用。

## 验收摘要

- 历史 cleaned/root-null Result 的精确空 container 会被删除，当前 closeout 继续。
- 非空目录、symlink、越界、Result/run/Workspace/carrier identity 不匹配继续返回 `unprovable`。
- 现有 active、cleanup_pending、abandoned foreign carrier 共存/owner action 行为不回归。
- Finish writer 的 carrier/container cleanup 测试继续通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task closeout orchestration delta](specs/task-closeout-orchestration/spec.md)
- [Tasks](tasks.md)
