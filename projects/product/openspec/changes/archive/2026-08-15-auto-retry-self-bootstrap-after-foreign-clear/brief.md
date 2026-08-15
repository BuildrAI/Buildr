# foreign carrier 清除后自动重试自举收尾

## 一句话摘要

同一次已授权的 self-bootstrap closeout 若仅被 foreign Finish carrier 零副作用阻断，在原 owner 清理完成后由 Agent 自动重试一次；重试只把 clean retained `dev` fast-forward 到最新远端并重新执行完整 preflight，无法安全承接时停止报告。

## 背景与问题

现有 runner 对 foreign carrier 的零副作用停止是正确的，但 recovery plan 把原 owner cleanup 和当前 runner 重试都定义为独立授权点。foreign owner 已完成清理后，current retry 没有新增跨 owner 权限，却仍要求一次人机往返。同时等待期间远端 `dev` 可能前进，现有 runner 不会把落后的 clean retained branch 更新到最新远端。

## 目标

- foreign owner cleanup 继续显式授权、由原 owner 执行。
- 精确 foreign block 且空 effects 的 current closeout，在阻断解除后自动重试一次。
- 重试以 latest remote `dev` 为准，只允许 clean fast-forward，并重新执行全部 identity/provenance preflight。
- 任何无法证明的状态停止并等待新指令。

## 非目标

- 不做 merge commit、rebase、冲突解决、stash、reset 或 force push。
- 不增加后台等待、持久队列、SQLite/Application 状态或跨 owner writer。
- 不改变普通 Workspace、npm package或 Formal Finish authority。

## 核心流程

1. runner 发现 foreign carrier，在全部 activation 副作用前返回 recovery plan。
2. 用户授权各 foreign owner 恢复自己的 cleanup；当前 runner retry 不再要求新授权。
3. Agent 只读确认 foreign 集合清空、前次 effects 为空且同一 run/command identity 未变。
4. Agent 自动重试一次；runner 读取最新远端 target ref，必要时只做 fast-forward。
5. runner 对最新 HEAD 重做 provenance、merge、remote、run/plan 和既有阶段检查；失败即报告等待。

## 验收摘要

测试应证明 owner cleanup 仍需授权、current retry 不需新授权；foreign 清除后本地落后可 fast-forward 到最新 Buildr-owned `dev` 并继续；分叉、merge、未知提交、dirty tree、identity 漂移或再次阻断均不进入 sync/安装/finalize。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-closeout-orchestration/spec.md`
- `specs/agent-task-workflows/spec.md`
- `tasks.md`
