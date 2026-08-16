# 发布历史衔接前完成自举激活

## 一句话摘要

Buildr 候选版准备在 release Task Finish 后先完成 matching self-bootstrap activation，再冻结候选并执行 `dev → main` 与 `main → dev` 历史衔接。

## 背景与问题

现有发布编排在 history bridge 后才调用 self-bootstrap runner。bridge 产生的 merge commit 会进入 Finish final ref 的后继链，runner 因 `self-bootstrap-closeout.descendant-merge-unprovable` 正确地零副作用阻断，导致远端候选正常但本地 development successor activation 未完成。

## 目标与非目标

- 目标：固定 activation-before-bridge 顺序，并让 bridge 机械验证 matching closeout evidence。
- 目标：activation 后重新冻结 `origin/dev` tree，确保 GitHub Candidate 与 bridge 使用同一候选。
- 非目标：不放宽 runner 对 descendant merge、dirty tree 或 remote drift 的保护。
- 非目标：不新增持久 activation store，不改变 tag/npm/GitHub Release 授权。

## 受影响用户或角色

主要影响执行 Buildr 候选版/稳定版准备的维护者与 Agent；普通 Buildr 用户 Workspace 不获得 self-bootstrap 能力。

## 核心流程

`release Task Finish → matching self-bootstrap runner → 重新读取 origin/dev tree → pre-main convergence → dev/main Candidate → evidence-gated main/dev bridge → post-main convergence`。

## 关键变化

- bridge 新增 Finish run 与 closeout evidence 输入，并在任何 merge/push 前验证。
- release Skill 调整 runner 调用位置、临时 evidence 生命周期与 candidate tree 冻结点。
- 测试覆盖成功、不适用、缺失、不匹配和漂移 evidence。

## 影响、风险与兼容性

旧的无 evidence bridge 调用将明确失败关闭，需要迁移到新参数；候选内容和发布外部副作用不变。临时 evidence 不是授权或持久 authority，其 freshness 由 live `origin/dev` ref 绑定。

## 验收摘要

- bridge 无 matching successful/not-applicable evidence 时零副作用失败。
- activation 在 pre-main 前执行，activation 后 tree 成为唯一候选 tree。
- runner 仍是唯一 activation orchestrator，descendant merge 规则保持不变。
- release/self-bootstrap focused 与 changed 验证通过。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/agent-task-workflows/spec.md`
- `tasks.md`
